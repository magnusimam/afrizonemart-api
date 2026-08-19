/**
 * Create supplier accounts for businesses that never came through the EOI/PIQ
 * forms — walk-ins, referrals, and the ones whose paperwork arrived by other
 * means.
 *
 *   npx tsx scripts/create-supplier-accounts.ts --file=data/imports/new-suppliers.csv
 *   npx tsx scripts/create-supplier-accounts.ts --file=... --commit
 *   npx tsx scripts/create-supplier-accounts.ts --email=a@b.com --company="Acme Foods" --commit
 *
 * The CSV needs `email` and `company` columns; `contact`, `country`, `category`
 * and `phone` are used when present.
 *
 * Accounts are created exactly the way `import-suppliers.ts` creates them: a
 * random unusable password, and `source: 'sheet-import'` so the supplier joins
 * the cohort that `invite-suppliers.ts` targets. They then set their own
 * password through the invite link like everyone else.
 *
 * It sends nothing. Inviting is a separate, deliberate step:
 *
 *   npx tsx scripts/invite-suppliers.ts --commit --only=a@b.com,c@d.com
 *
 * Keeping creation and invitation apart is what lets you fix a misspelled
 * company name before the supplier ever sees it.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

interface Row {
  email: string;
  company: string;
  contact?: string;
  country?: string;
  category?: string;
  phone?: string;
}

function readRows(): Row[] {
  const file = arg('file');
  if (file) {
    if (!fs.existsSync(file)) {
      console.error(`No file at ${file}`);
      process.exit(1);
    }
    const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf8'), {
      header: true,
      skipEmptyLines: true,
    });
    return parsed.data
      .map((r) => ({
        email: (r.email ?? '').trim().toLowerCase(),
        company: (r.company ?? '').trim(),
        contact: (r.contact ?? '').trim() || undefined,
        country: (r.country ?? '').trim() || undefined,
        category: (r.category ?? '').trim() || undefined,
        phone: (r.phone ?? '').trim() || undefined,
      }))
      .filter((r) => r.email && r.company);
  }

  const email = arg('email');
  const company = arg('company');
  if (!email || !company) {
    console.error('Give --file=<csv>, or both --email= and --company=.');
    process.exit(1);
  }
  return [
    {
      email: email.trim().toLowerCase(),
      company: company.trim(),
      contact: arg('contact'),
      country: arg('country'),
      category: arg('category'),
      phone: arg('phone'),
    },
  ];
}

async function main() {
  const rows = readRows();
  const existing = await prisma.user.findMany({
    where: { email: { in: rows.map((r) => r.email) } },
    include: { supplierProfile: true },
  });
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));

  const toCreate: Row[] = [];
  const already: string[] = [];

  for (const r of rows) {
    const u = byEmail.get(r.email);
    if (u?.supplierProfile) {
      already.push(`${r.email.padEnd(34)} already a supplier — ${u.supplierProfile.companyName}`);
    } else {
      toCreate.push(r);
    }
  }

  console.log(`rows: ${rows.length}   to create: ${toCreate.length}   already suppliers: ${already.length}\n`);
  for (const r of toCreate) {
    console.log(`  ${r.email.padEnd(34)} ${r.company}`);
  }
  if (already.length) {
    console.log('\n--- skipped ---');
    for (const a of already) console.log(`  ${a}`);
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing written. Add --commit.)');
    return;
  }

  let created = 0;
  for (const r of toCreate) {
    // Unusable by design: the supplier sets their own through the invite link,
    // exactly as the bulk-imported cohort did. Never a shared default.
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 12);

    const user = await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: {
        email: r.email,
        passwordHash,
        name: r.contact ?? r.company,
        role: 'CUSTOMER',
      },
    });

    await prisma.supplierProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        companyName: r.company,
        contactName: r.contact ?? r.company,
        country: r.country ?? 'Nigeria',
        category: r.category ?? 'Food & Beverage',
        phone: r.phone ?? null,
        currentStage: 2,
        status: 'ACTIVE',
        source: 'sheet-import',
      },
    });
    created++;
    console.log(`  ✓ ${r.company} — ${r.email}`);
  }

  console.log(`\nCreated: ${created}`);
  console.log('\nNo email sent. Invite them with:');
  console.log(
    `   npx tsx scripts/invite-suppliers.ts --commit --only=${toCreate.map((r) => r.email).join(',')}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
