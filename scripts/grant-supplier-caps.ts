/**
 * Grant the supplier-portal admin capabilities to a STAFF user. Use this in
 * production instead of promoting people to full ADMIN — each department gets
 * only what it needs:
 *   suppliers.review  — Merchandise Sourcing: PIQ review queue + review calls + orientation
 *   suppliers.visits  — Facility Visit team: schedule/confirm site visits
 *   suppliers.audit   — Quality & Compliance: conduct product-commodity audits
 *   suppliers.trade   — Activation & Procurement: publish listings + issue purchase orders
 *
 * The user is set to role STAFF (if not already ADMIN) and the caps are merged
 * into User.permissions[]. ADMIN users already have every capability — for them
 * this is a no-op.
 *
 * Usage:
 *   npm run grant-supplier-caps -- qc@afrizonemart.com suppliers.audit
 *   npm run grant-supplier-caps -- sourcing@afrizonemart.com suppliers.review suppliers.visits
 *   npm run grant-supplier-caps -- staff@afrizonemart.com all
 *
 * Lives in scripts/ so it never ships in the server bundle.
 */
import { PrismaClient } from '@prisma/client';

const SUPPLIER_CAPS = ['suppliers.review', 'suppliers.visits', 'suppliers.audit', 'suppliers.trade'] as const;

async function main() {
  const [emailArg, ...capArgs] = process.argv.slice(2);
  if (!emailArg || capArgs.length === 0) {
    console.error('Usage: npm run grant-supplier-caps -- <email> <cap...|all>');
    console.error(`  caps: ${SUPPLIER_CAPS.join(', ')} | all`);
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const caps = capArgs.includes('all')
    ? [...SUPPLIER_CAPS]
    : capArgs.filter((c) => (SUPPLIER_CAPS as readonly string[]).includes(c));
  const invalid = capArgs.filter((c) => c !== 'all' && !(SUPPLIER_CAPS as readonly string[]).includes(c));
  if (invalid.length) {
    console.error(`Unknown capability/capabilities: ${invalid.join(', ')}`);
    console.error(`Valid: ${SUPPLIER_CAPS.join(', ')} | all`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user with email "${email}".`);
      process.exit(1);
    }
    if (user.role === 'ADMIN') {
      console.log(`✓ ${email} is ADMIN — already has all capabilities. Nothing to do.`);
      return;
    }
    const merged = Array.from(new Set([...(user.permissions ?? []), ...caps]));
    const updated = await prisma.user.update({
      where: { email },
      data: { role: 'STAFF', permissions: merged },
    });
    console.log(`✓ ${updated.email}: role STAFF, permissions = [${updated.permissions.join(', ')}]`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('grant-supplier-caps failed:', err);
  process.exit(1);
});
