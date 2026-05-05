/**
 * Promote an existing user to the SUPPLIER role and create their
 * Supplier profile row. Runs the same upsert pattern as make-admin.ts
 * so it's idempotent — re-running with the same email is a no-op when
 * the user's already a SUPPLIER.
 *
 * Usage:
 *   npm run make-supplier -- contact@brand.com
 *   npm run make-supplier -- contact@brand.com "Brand Foods Ltd"
 *
 * The optional second arg sets the Supplier.companyName up front;
 * otherwise it stays null and the supplier fills it in via the
 * profile page.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const [emailArg, companyArg] = process.argv.slice(2);

  if (!emailArg) {
    console.error('Usage: npm run make-supplier -- <email> [companyName]');
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email "${email}". Sign them up first via /register.`);
      process.exit(1);
    }

    // Promote role + ensure Supplier row exists. Upsert keeps it idempotent.
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'SUPPLIER' },
    });

    const supplier = await prisma.supplier.upsert({
      where: { userId: user.id },
      update: companyArg ? { companyName: companyArg } : {},
      create: {
        userId: user.id,
        companyName: companyArg ?? null,
        currentStage: 1,
        maxStage: 10,
        minimumPIQsRequired: 1,
      },
    });

    console.log(`✓ ${email} is now a SUPPLIER`);
    console.log(`  Supplier id: ${supplier.id}`);
    console.log(`  Stage:       ${supplier.currentStage}/${supplier.maxStage}`);
    if (supplier.companyName) console.log(`  Company:     ${supplier.companyName}`);
    console.log('');
    console.log('Tell them to sign in at /supplier/login.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
