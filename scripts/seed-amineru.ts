import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Creates an account with a password published in this file — dev only.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run: dev-only seed with a known password.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(process.env.SEED_SUPPLIER_PASSWORD ?? 'Supplier123!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'aminerunigent@yahoo.com' },
    update: {},
    create: {
      email: 'aminerunigent@yahoo.com',
      passwordHash: hash,
      name: 'Amine Runigent',
      role: 'SELLER',
    },
  });

  await prisma.supplierProfile.upsert({
    where: { userId: user.id },
    update: { currentStage: 4, status: 'ACTIVE' },
    create: {
      userId: user.id,
      companyName: 'Runigent Co',
      contactName: 'Amine Runigent',
      phone: null,
      country: 'Nigeria',
      region: 'Lagos',
      category: 'General',
      currentStage: 4,
    },
  });

  console.log('✓ aminerunigent@yahoo.com / Supplier123!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
