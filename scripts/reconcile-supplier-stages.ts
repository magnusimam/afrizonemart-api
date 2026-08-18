/**
 * Stage reconciliation — DRY RUN by default (read-only).
 *
 *   npx tsx scripts/reconcile-supplier-stages.ts             (report only)
 *   npx tsx scripts/reconcile-supplier-stages.ts --commit    (apply)
 *   npx tsx scripts/reconcile-supplier-stages.ts --only=a@b.com
 *
 * Why this exists: `import-suppliers.ts` assigns `stage: piqM.length > 0 ? 4 : 3`
 * and nothing else. The EOI/PIQ sheet exports carry no trace of review calls,
 * orientation, facility visits or audits, so every migrated supplier lands at
 * stage 3 or 4 no matter how far they actually got. Since stage locking became
 * real, that is not a cosmetic problem — `StageAccessGate` genuinely blocks
 * those suppliers out of stages they have already been through.
 *
 * This walks the records that DO prove progress and raises `currentStage` to
 * match. It is a floor, never a ceiling: `proposed = max(current, ...evidence)`,
 * so nobody is ever moved backwards and a supplier who is legitimately ahead of
 * their paper trail is left alone.
 *
 * Output → data/imports/stage-reconciliation.csv (git-ignored — it holds PII).
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { prisma } from '@/infra/prisma';

const COMMIT = process.argv.includes('--commit');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;

const OUT_DIR = path.join(process.cwd(), 'data', 'imports');
const OUT_FILE = path.join(OUT_DIR, 'stage-reconciliation.csv');

const STAGE_NAMES = [
  'Discovery',
  'Expression of Interest',
  'Registration & Profiling',
  'Product Questionnaire',
  'Orientation',
  'Product Audit',
  'Partnership',
  'Activation & Listing',
  'Trade Engagement',
  'Continuous Engagement',
];
const stageName = (n: number) => STAGE_NAMES[n - 1] ?? `Stage ${n}`;

/** One piece of evidence that a supplier reached at least `floor`. */
interface Signal {
  floor: number;
  why: string;
}

interface Row {
  company: string;
  email: string;
  source: string;
  currentStage: number;
  proposedStage: number;
  delta: number;
  proposedName: string;
  evidence: string;
}

async function main() {
  const suppliers = await prisma.supplierProfile.findMany({
    include: {
      user: { select: { email: true } },
      reviewCall: { select: { status: true } },
      facilityVisit: { select: { status: true } },
      audit: { select: { status: true, outcome: true } },
      productionBooking: { select: { status: true } },
      _count: { select: { piqs: true, purchaseOrders: true } },
    },
    orderBy: { companyName: 'asc' },
  });

  const targets = only
    ? suppliers.filter((s) => s.user?.email?.toLowerCase() === only)
    : suppliers;

  console.log(`Supplier profiles examined: ${targets.length}${only ? ` (filtered to ${only})` : ''}`);

  const rows: Row[] = [];

  for (const s of targets) {
    const signals: Signal[] = [];

    // ── Supplier-completed stages ───────────────────────────────────
    // `completeStage` writes answers under the stage number and advances to
    // stage + 1, so a recorded answer set is proof that stage was finished.
    // This is the same arithmetic, applied retroactively.
    const answers = (s.stageAnswers as Record<string, unknown> | null) ?? {};
    for (const key of Object.keys(answers)) {
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1 && n <= 10) {
        signals.push({ floor: Math.min(10, n + 1), why: `completed stage ${n} (${stageName(n)})` });
      }
    }

    // ── Product questionnaires (stage 4) ────────────────────────────
    if (s._count.piqs > 0) {
      signals.push({ floor: 4, why: `${s._count.piqs} PIQ(s) on file` });
    }

    // ── Review call → Orientation (stage 5) ─────────────────────────
    // Any review call at all means AZM had already moved them into stage 5;
    // the call is scheduled from that stage, never before it.
    if (s.reviewCall) {
      signals.push({ floor: 5, why: `review call ${s.reviewCall.status}` });
    }

    // ── Facility visit → Product Audit (stage 6) ────────────────────
    // The visit is the front half of stage 6 and feeds the audit, so a visit
    // in ANY state proves they reached 6. A completed one does not imply 7 —
    // the audit still has to be carried out.
    if (s.facilityVisit) {
      signals.push({ floor: 6, why: `facility visit ${s.facilityVisit.status}` });
    }

    // ── Audit (stage 6 → 7) ─────────────────────────────────────────
    // Mirrors `authoriseAudit`, which already does max(currentStage, 7).
    if (s.audit) {
      if (s.audit.status === 'COMPLETED') {
        const outcome = s.audit.outcome ? ` ${s.audit.outcome}` : '';
        signals.push({ floor: 7, why: `audit COMPLETED${outcome}` });
      } else {
        signals.push({ floor: 6, why: `audit ${s.audit.status}` });
      }
    }

    // ── Production booking → Activation & Listing (stage 8) ─────────
    if (s.productionBooking) {
      signals.push({ floor: 8, why: `production booking ${s.productionBooking.status}` });
    }

    // ── Purchase orders → Trade Engagement (stage 9) ────────────────
    if (s._count.purchaseOrders > 0) {
      signals.push({ floor: 9, why: `${s._count.purchaseOrders} purchase order(s)` });
    }

    if (!signals.length) continue;

    const proposed = Math.max(s.currentStage, ...signals.map((x) => x.floor));
    if (proposed === s.currentStage) continue;

    // Only the signals that actually justify the move are worth reading in the
    // report — the ones at or below the current stage explain nothing.
    const decisive = signals
      .filter((x) => x.floor > s.currentStage)
      .sort((a, b) => b.floor - a.floor)
      .map((x) => `→${x.floor}: ${x.why}`)
      .join(' | ');

    rows.push({
      company: s.companyName,
      email: s.user?.email ?? '(no email)',
      source: s.source ?? '(self-signup)',
      currentStage: s.currentStage,
      proposedStage: proposed,
      delta: proposed - s.currentStage,
      proposedName: stageName(proposed),
      evidence: decisive,
    });
  }

  if (!rows.length) {
    console.log('\nNo supplier needs moving — every stage already matches the evidence.');
    return;
  }

  rows.sort((a, b) => b.delta - a.delta || a.company.localeCompare(b.company));

  console.log(`\nSuppliers whose stage is behind their record: ${rows.length}\n`);
  for (const r of rows) {
    console.log(`  ${r.company}  (${r.email})`);
    console.log(`     stage ${r.currentStage} → ${r.proposedStage}  ${r.proposedName}`);
    console.log(`     ${r.evidence}`);
  }

  const spread = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.currentStage} → ${r.proposedStage}`;
    spread.set(k, (spread.get(k) ?? 0) + 1);
  }
  console.log('\nMoves by transition:');
  for (const [k, v] of [...spread.entries()].sort()) console.log(`  ${k}: ${v}`);

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, Papa.unparse(rows));
    console.log(`\nReport → ${OUT_FILE}`);
  } catch (err) {
    console.warn(`  ⚠ could not write the report (open elsewhere?) — ${(err as Error).message}`);
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing written to the database. Add --commit to apply.)');
    return;
  }

  let moved = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      // Re-resolved by email rather than carried as an id: the report is meant
      // to be read (and possibly sat on) between the dry run and the commit.
      const supplier = await prisma.supplierProfile.findFirst({
        where: { companyName: r.company, user: { email: r.email } },
        select: { id: true, currentStage: true },
      });
      if (!supplier) {
        failed++;
        console.error(`   ✗ ${r.company}: no longer resolvable`);
        continue;
      }
      // Never move backwards, even if the row is stale.
      if (supplier.currentStage >= r.proposedStage) continue;
      await prisma.supplierProfile.update({
        where: { id: supplier.id },
        data: { currentStage: r.proposedStage },
      });
      moved++;
    } catch (err) {
      failed++;
      console.error(`   ✗ ${r.company}: ${(err as Error).message}`);
    }
  }
  console.log(`\nStages updated: ${moved} | failed: ${failed}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
