/**
 * Import extracted conformity diagnostic reports into supplier audit records.
 *
 *   python scripts/extract-diagnostic-reports.py "<folder>"   # produces the JSON
 *   npx tsx scripts/import-diagnostic-reports.ts              # dry run
 *   npx tsx scripts/import-diagnostic-reports.ts --commit
 *
 * These audits were carried out and written up in Word before the portal could
 * generate reports. This backfills them so each supplier's Stage 6 shows the
 * findings they were actually assessed against.
 *
 * IT DOES NOT AUTHORISE ANYTHING. Every record lands COMPLETED with
 * `approvedAt` null, which is the state the supplier cannot yet see. That is
 * deliberate and important: authorising is what releases the report and emails
 * the supplier, and every one of these outcomes is REJECTED. Nine businesses
 * receiving an automated rejection because a backfill script ran is not a
 * recoverable mistake. A human opens each one in the admin UI, reads it, and
 * signs it off.
 *
 * Fuzzy company matches are listed for review rather than applied silently:
 * attaching a rejection to the wrong supplier is the worst thing this script
 * could do, so anything not an exact match needs a line in MATCH_OVERRIDES.
 */
import fs from 'node:fs';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const SOURCE = 'data/imports/diagnostic-reports.json';

interface Report {
  file: string;
  company: string;
  descriptor?: string | null;
  protocolCode?: string | null;
  documentCode?: string | null;
  protocolName?: string | null;
  issueDate?: string | null;
  outcome?: string | null;
  outcomeText?: string | null;
  indicativeScore?: number | null;
  counts: Record<string, number>;
  executiveSummary?: string | null;
  whatThisMeans?: string | null;
  headlineFindings: { severity: string; finding: string }[];
  responses: Record<string, { rating: string; statusNote?: string; requirement?: string }>;
  capa: { ref: string; finding: string; action: string; timeline?: string }[];
  checkpointCount: number;
}

/**
 * Report company name → supplier account email.
 *
 * Only needed where the names differ enough that an exact match fails. Keyed on
 * email rather than company name because the email is the thing that is unique
 * and the thing a human can verify at a glance.
 */
const MATCH_OVERRIDES: Record<string, string> = {
  'AVIS FOODS': 'goretylux77@gmail.com',
  'JVV FOODS': 'jvvfoodltd@gmail.com',
  'P.P. FOODS': 'ppinternationalfoods@gmail.com',
  VARLI: 'varlifoods@gmail.com',
  'EDEN FOODS': 'edenwholefoodsng@gmail.com',
  KAYPLAN: 'kike@steerfornewbor.org',
  'MATMA FOODS & WELLNESS': 'matmafoods01@gmail.com',
  'OLUWATOYIN INTEGRATED FARMS': 'oluwatoyinintegratedfarms@gmail.com',
  USEDIAMEG: 'usefoods2@gmail.com',
};

/** Audited but never in the EOI/PIQ data, so there is no account to attach to. */
const KNOWN_NO_ACCOUNT = new Set(['KWIKMEALS', 'RITZY FOODS', 'SHEACOCO']);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The protocol maps to the audit template letter the portal already uses. */
function categoryFor(protocolCode?: string | null): string | null {
  if (!protocolCode) return null;
  if (protocolCode.includes('FPS')) return 'A';
  if (protocolCode.includes('EOB')) return 'B';
  if (protocolCode.includes('HPC')) return 'C';
  return null;
}

function buildSummary(r: Report): string {
  const bits: string[] = [];
  if (r.executiveSummary) bits.push(r.executiveSummary);
  if (r.whatThisMeans) bits.push(r.whatThisMeans);
  return bits.join('\n\n').slice(0, 8000);
}

function buildRecommendations(r: Report): string {
  const heads = r.headlineFindings
    .map((h) => `[${h.severity}] ${h.finding}`)
    .join('\n');
  return heads.slice(0, 8000);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`No ${SOURCE}. Run the extractor first:`);
    console.error('  python scripts/extract-diagnostic-reports.py "<folder>"');
    process.exit(1);
  }
  const reports: Report[] = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const suppliers = await prisma.supplierProfile.findMany({
    include: { user: { select: { email: true } } },
  });

  const byEmail = new Map(suppliers.map((s) => [s.user.email.toLowerCase(), s]));
  const byName = new Map(suppliers.map((s) => [norm(s.companyName), s]));

  const planned: { r: Report; supplierId: string; company: string; email: string }[] = [];
  const skipped: string[] = [];

  for (const r of reports) {
    const override = MATCH_OVERRIDES[r.company];
    const match = override ? byEmail.get(override.toLowerCase()) : byName.get(norm(r.company));

    if (!match) {
      const why = KNOWN_NO_ACCOUNT.has(r.company)
        ? 'no supplier account (audited but never in the EOI/PIQ data)'
        : 'NO MATCH — add a line to MATCH_OVERRIDES';
      skipped.push(`${r.company.padEnd(30)} ${why}`);
      continue;
    }
    planned.push({
      r,
      supplierId: match.id,
      company: match.companyName,
      email: match.user.email,
    });
  }

  console.log(`reports: ${reports.length}   matched: ${planned.length}   skipped: ${skipped.length}\n`);
  for (const p of planned) {
    const c = p.r.counts;
    console.log(
      `  ${p.r.company.padEnd(28)} -> ${p.company.padEnd(38)} ` +
        `${p.r.protocolCode ?? '?'} score=${p.r.indicativeScore ?? '?'} ` +
        `C${c.critical ?? 0} M${c.major ?? 0} Mi${c.minor ?? 0} O${c.observation ?? 0} ` +
        `chk=${p.r.checkpointCount} capa=${p.r.capa.length}`,
    );
  }
  if (skipped.length) {
    console.log('\n--- skipped ---');
    for (const s of skipped) console.log(`  ${s}`);
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing written. Add --commit.)');
    return;
  }

  let created = 0;
  let updated = 0;
  let refused = 0;

  for (const p of planned) {
    const existing = await prisma.supplierAudit.findUnique({
      where: { supplierId: p.supplierId },
    });

    // An authorised audit has been released to the supplier and may have been
    // acted on. Overwriting it would rewrite history they have already read.
    if (existing?.approvedAt) {
      console.log(`  refused  ${p.company} — already authorised, left untouched`);
      refused++;
      continue;
    }

    const counts = {
      critical: p.r.counts.critical ?? 0,
      major: p.r.counts.major ?? 0,
      minor: p.r.counts.minor ?? 0,
      observation: p.r.counts.observation ?? 0,
      compliant: Object.values(p.r.responses).filter((x) => x.rating === 'Cpt').length,
      na: Object.values(p.r.responses).filter((x) => x.rating === 'NA').length,
    };

    const data = {
      status: 'COMPLETED' as const,
      category: categoryFor(p.r.protocolCode),
      outcome: p.r.outcome ?? null,
      indicativeScore: p.r.indicativeScore ?? null,
      counts: counts as unknown as Prisma.InputJsonValue,
      responses: p.r.responses as unknown as Prisma.InputJsonValue,
      capa: p.r.capa as unknown as Prisma.InputJsonValue,
      summary: buildSummary(p.r),
      recommendations: buildRecommendations(p.r),
      conductedAt: p.r.issueDate ? new Date(p.r.issueDate) : null,
      // Left unauthorised on purpose — see the header comment.
      approvedAt: null,
      signedBy: null,
    };

    if (existing) {
      await prisma.supplierAudit.update({ where: { supplierId: p.supplierId }, data });
      updated++;
    } else {
      await prisma.supplierAudit.create({ data: { supplierId: p.supplierId, ...data } });
      created++;
    }
  }

  console.log(`\n================ IMPORT COMMITTED ================`);
  console.log(`  created  : ${created}`);
  console.log(`  updated  : ${updated}`);
  console.log(`  refused  : ${refused} (already authorised)`);
  console.log('\n  All records are COMPLETED but NOT authorised.');
  console.log('  Nobody has been emailed. Open each in /admin/supplier-audits,');
  console.log('  read it, and authorise to release it to the supplier.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
