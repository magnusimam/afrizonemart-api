/**
 * Supplier import — DRY RUN (read-only). Reads data/imports/*.csv, resolves
 * companies, and writes review files. Creates NOTHING, emails NO ONE.
 *
 *   npx tsx scripts/import-suppliers.ts
 *
 * Outputs (in data/imports/):
 *   dry-run-report.csv  — every resolved company + stage + flags
 *   manual-skip.csv     — companies with no email/phone we can't invite
 *   verify-overmerge.csv— groups that look like a cluster over-merge
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DIR,
  buildEntities,
  groupEntities,
  nameSimilarity,
  type Entity,
} from './lib/import-core';
import { EOI_MAP, PIQ_MAP, mapAnswers } from './lib/field-map';

const COMMIT = process.argv.includes('--commit');
const entities = buildEntities();
const groups = groupEntities(entities, { borrowEmailSim: 0.9 });

const distinct = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
const eoiName = (m: Entity[]) =>
  m.find((e) => e.kind === 'eoi' && e.company)?.company || m.find((e) => e.company)?.company || '';

/** Prefer a business-looking email over a free webmail one as primary. */
function primaryEmail(emails: string[]): string {
  if (!emails.length) return '';
  const biz = emails.find((e) => !/(gmail|yahoo|outlook|hotmail|icloud)\./.test(e));
  return biz ?? emails[0];
}

interface Row {
  company: string;
  contact: string;
  email: string;
  altEmails: string;
  phone: string;
  country: string;
  category: string;
  hasEoi: string;
  piqProducts: number;
  products: string;
  stage: number;
  resolution: string;
  flags: string;
  note: string;
}

const companies = groups.map((m) => {
  const eoiM = m.filter((e) => e.kind === 'eoi');
  const piqM = m.filter((e) => e.kind === 'piq');
  const emails = distinct(m.map((e) => e.email));
  const phones = distinct(m.map((e) => e.phone));
  const names = distinct(m.map((e) => e.company));
  const email = primaryEmail(emails);

  // Over-merge heuristic: ≥3 emails AND ≥2 phones AND names not consistent.
  const namesConsistent =
    names.length <= 1 || names.every((n) => nameSimilarity(n, names[0]) >= 0.5);
  const overMerged = emails.length >= 3 && phones.length >= 2 && !namesConsistent;

  const flags: string[] = [];
  if (!emails.length && !phones.length) flags.push('NO_CONTACT');
  else if (!emails.length) flags.push('NO_EMAIL_HAS_PHONE');
  if (emails.length > 1 && !overMerged) flags.push('MULTI_EMAIL_SAME_CO');
  if (overMerged) flags.push('OVER_MERGE_REVIEW');
  if (piqM.length > 1) flags.push('MULTI_PIQ');
  if (!eoiM.length) flags.push('PIQ_ONLY');
  if (!piqM.length) flags.push('EOI_ONLY');

  const resolution = overMerged
    ? 'VERIFY (cluster?)'
    : !emails.length && !phones.length
      ? 'SKIP (no contact)'
      : !emails.length
        ? 'NEEDS_EMAIL (has phone)'
        : 'IMPORT';

  const row: Row = {
    company: eoiName(m) || names[0] || '(no name)',
    contact: m.find((e) => e.contact)?.contact ?? '',
    email,
    altEmails: emails.filter((e) => e !== email).join(' | '),
    phone: phones[0] ?? '',
    country: m.find((e) => e.country)?.country ?? '',
    category: piqM.find((e) => e.category)?.category || eoiM.find((e) => e.category)?.category || '',
    hasEoi: eoiM.length ? 'Y' : 'N',
    piqProducts: piqM.length,
    products: piqM.map((e) => e.product).filter(Boolean).join(' | '),
    stage: piqM.length > 0 ? 4 : 3,
    resolution,
    flags: flags.join(','),
    note: eoiM.find((e) => e.note)?.note ?? '',
  };
  return { members: m, eoiM, piqM, row };
});

const rows: Row[] = companies.map((c) => c.row);
rows.sort((a, b) => a.resolution.localeCompare(b.resolution) || a.company.localeCompare(b.company));

const write = (name: string, data: Row[]) => {
  try {
    fs.writeFileSync(path.join(DIR, name), Papa.unparse(data));
  } catch (err) {
    console.warn(`  ⚠ could not write ${name} (open elsewhere?) — skipping. ${(err as Error).message}`);
  }
};
write('dry-run-report.csv', rows);
write('manual-skip.csv', rows.filter((r) => r.resolution.startsWith('SKIP')));
write('verify-overmerge.csv', rows.filter((r) => r.resolution.startsWith('VERIFY')));

const c = (p: (r: Row) => boolean) => rows.filter(p).length;
console.log('\n================ DRY-RUN SUMMARY ================');
console.log('EOI rows:', entities.filter((e) => e.kind === 'eoi').length,
            '| PIQ rows:', entities.filter((e) => e.kind === 'piq').length,
            '| products:', rows.reduce((s, r) => s + r.piqProducts, 0));
console.log('→ COMPANIES            :', rows.length);
console.log('   ✅ IMPORT (have email):', c((r) => r.resolution === 'IMPORT'));
console.log('        of which EOI+PIQ  :', c((r) => r.resolution === 'IMPORT' && r.hasEoi === 'Y' && r.piqProducts > 0));
console.log('        EOI only          :', c((r) => r.resolution === 'IMPORT' && r.flags.includes('EOI_ONLY')));
console.log('        PIQ only          :', c((r) => r.resolution === 'IMPORT' && r.flags.includes('PIQ_ONLY')));
console.log('   📞 NEEDS_EMAIL (phone) :', c((r) => r.resolution.startsWith('NEEDS_EMAIL')));
console.log('   🔎 VERIFY (cluster?)   :', c((r) => r.resolution.startsWith('VERIFY')));
console.log('   ⏭  SKIP (no contact)   :', c((r) => r.resolution.startsWith('SKIP')));
console.log('   (multi-email, same co) :', c((r) => r.flags.includes('MULTI_EMAIL_SAME_CO')));
console.log('\nFiles → dry-run-report.csv, manual-skip.csv, verify-overmerge.csv');
console.log('\n--- SKIP list (no email + no phone) ---');
rows.filter((r) => r.resolution.startsWith('SKIP')).forEach((r) =>
  console.log(`   • ${r.company}  (${r.piqProducts} product(s): ${r.products.slice(0, 60)})`),
);

if (!COMMIT) {
  console.log('\n(DRY RUN — nothing written. Re-run with --commit to import the IMPORT bucket.)');
  process.exit(0);
}

// ---------------- REAL IMPORT (idempotent, no emails) ----------------
const prisma = new PrismaClient();

async function commit() {
  const toImport = companies.filter((c) => c.row.resolution === 'IMPORT');
  let users = 0;
  let profiles = 0;
  let products = 0;

  for (const c of toImport) {
    const { row, eoiM, piqM } = c;
    if (!row.email) continue;

    // 1) account — random unusable password; they set their own via invite.
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    const user = await prisma.user.upsert({
      where: { email: row.email },
      update: { name: row.contact || undefined },
      create: { email: row.email, passwordHash, name: row.contact || null },
    });
    users++;

    // 2) supplier profile (+ EOI answers preserved)
    const eoiAnswers = eoiM[0]
      ? mapAnswers(eoiM[0].raw, eoiM[0].srcCols, EOI_MAP)
      : undefined;
    const base = {
      companyName: row.company,
      contactName: row.contact || row.company,
      phone: row.phone || null,
      country: row.country || 'Nigeria',
      category: row.category || 'Other',
      currentStage: row.stage,
      eoiAnswers: eoiAnswers ?? undefined,
      source: 'sheet-import',
      importedAt: new Date(),
    };
    const profile = await prisma.supplierProfile.upsert({
      where: { userId: user.id },
      update: base,
      create: { userId: user.id, ...base },
    });
    profiles++;

    // 3) products — re-sync (delete prior imported, recreate from source)
    await prisma.productPIQ.deleteMany({
      where: { supplierId: profile.id, source: 'sheet-import' },
    });
    for (const p of piqM) {
      const answers = mapAnswers(p.raw, p.srcCols, PIQ_MAP);
      const completion = Math.round(
        (Object.values(answers).filter(Boolean).length / PIQ_MAP.length) * 100,
      );
      await prisma.productPIQ.create({
        data: {
          supplierId: profile.id,
          name: p.product || '(unnamed product)',
          brand: p.company || null,
          category: p.category || null,
          status: 'SUBMITTED',
          completion,
          answers,
          source: 'sheet-import',
          sourceRef: p.id,
        },
      });
      products++;
    }
  }

  console.log('\n================ IMPORT COMMITTED ================');
  console.log('  accounts upserted :', users);
  console.log('  profiles upserted :', profiles);
  console.log('  products created  :', products);
  console.log('  (no emails sent — invites are a separate step)');
}

commit()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
