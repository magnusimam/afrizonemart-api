/**
 * Promote (or demote) a user to the ADMIN role.
 *
 * Usage:
 *   npm run make-admin -- magnus@afrizonemart.com
 *   npm run make-admin -- magnus@afrizonemart.com CUSTOMER     # demote
 *
 * Lives in scripts/ rather than src/ so it never gets bundled into the
 * production server. Reads DATABASE_URL from .env via the standard
 * Prisma client.
 */
import { PrismaClient, type UserRole } from '@prisma/client';

const VALID_ROLES: UserRole[] = ['CUSTOMER', 'SELLER', 'ADMIN'];

async function main() {
  const [emailArg, roleArg] = process.argv.slice(2);

  if (!emailArg) {
    console.error('Usage: npm run make-admin -- <email> [ROLE]');
    console.error('  ROLE defaults to ADMIN. Valid: CUSTOMER, SELLER, ADMIN.');
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const role = ((roleArg ?? 'ADMIN').toUpperCase() as UserRole);

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${roleArg}". Valid: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      console.error(`No user with email "${email}".`);
      process.exit(1);
    }
    if (existing.role === role) {
      console.log(`✓ ${email} already has role ${role}. Nothing to do.`);
      return;
    }
    const updated = await prisma.user.update({
      where: { email },
      data: { role },
    });
    console.log(`✓ ${updated.email}: ${existing.role} → ${updated.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('make-admin failed:', err);
  process.exit(1);
});
