/**
 * Seed a demo supplier so the live portal matches the frontend mock
 * (Adia Foods, Stage 4). Idempotent — safe to run repeatedly.
 *
 *   npm run seed-supplier      (after adding the script alias)
 *   npx tsx scripts/seed-supplier.ts
 *
 * Login: adia@adiafoods.ng / Supplier123!
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { refuseOnProduction } from './lib/refuse-on-production';

const prisma = new PrismaClient();

const EMAIL = 'adia@adiafoods.ng';
const PASSWORD = process.env.SEED_SUPPLIER_PASSWORD ?? 'Supplier123!';

async function main() {
  // Creates an account with a password published in this file: harmless on a
  // dev box, a live vulnerability anywhere else. Guards on the DATABASE_URL
  // host, not just NODE_ENV — see lib/refuse-on-production.ts.
  refuseOnProduction('seed-supplier');

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, passwordHash, name: 'Adia Sowho' },
  });

  await prisma.supplierProfile.upsert({
    where: { userId: user.id },
    update: { currentStage: 4, status: 'ACTIVE' },
    create: {
      userId: user.id,
      companyName: 'Adia Foods',
      contactName: 'Adia Sowho',
      phone: '+234 801 234 5678',
      country: 'Nigeria',
      region: 'Lagos',
      category: 'Food',
      currentStage: 4,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`✓ Seeded supplier  →  ${EMAIL} / ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
