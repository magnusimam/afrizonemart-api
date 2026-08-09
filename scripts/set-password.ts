/* Dev helper: set a known password for an account.
 *   npx tsx scripts/set-password.ts <email> <password>
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('usage: set-password.ts <email> <password>');
  process.exit(1);
}
const prisma = new PrismaClient();
(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { email },
    data: { passwordHash, refreshTokenHash: null, lockedUntil: null, failedLoginAttempts: 0 },
  });
  // eslint-disable-next-line no-console
  console.log('✓ password set for', email);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
