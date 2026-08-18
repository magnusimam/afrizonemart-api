/**
 * Create (or remove) the demo supplier account used for live walkthroughs.
 *
 *   npx tsx scripts/create-demo-supplier.ts                  (dry run)
 *   npx tsx scripts/create-demo-supplier.ts --commit
 *   npx tsx scripts/create-demo-supplier.ts --commit --email=demo@afrizonemart.com
 *   npx tsx scripts/create-demo-supplier.ts --commit --remove
 *
 * Unlike the seed scripts, this one is MEANT to run against production: it is
 * how you demo the portal without signing in as a real supplier and exposing
 * their business on a projector. That is also why it shares none of their
 * machinery — `refuse-on-production.ts` exists to stop seeds reaching prod, and
 * the reason those must never run there is that their password is published in
 * the source. So this script has no hardcoded password at all:
 *
 *   - DEMO_SUPPLIER_PASSWORD if you set it, or
 *   - a strong random one, printed once and never stored in plaintext.
 *
 * The account opens every stage (`currentStage: 10`) so all ten pages are
 * reachable. It deliberately does NOT write a stage-5 `completedAt`: that flag
 * is what closes the orientation room for good, so leaving it unset keeps the
 * countdown on screen, gated by the clock as a real supplier would see it.
 *
 * PIQs, EOI answers and journey records are left empty on purpose — an empty
 * portal demos the flow; invented products would demo a fiction.
 *
 * `--remove` deletes it again. Run that after the demo: this is a real login on
 * a live site.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const REMOVE = process.argv.includes('--remove');
const emailArg = process.argv.find((a) => a.startsWith('--email='));
const EMAIL = (emailArg ? emailArg.slice('--email='.length) : 'demo@afrizonemart.com')
  .trim()
  .toLowerCase();

/** Readable but strong: base64url of 18 random bytes, ~144 bits. */
function generatePassword(): string {
  return `Azm-${randomBytes(18).toString('base64url')}`;
}

async function remove() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { supplierProfile: true },
  });
  if (!user) {
    console.log(`Nothing to remove — no account for ${EMAIL}.`);
    return;
  }
  if (user.supplierProfile && user.supplierProfile.source !== 'demo') {
    console.error(
      `Refusing to remove ${EMAIL}: its profile is not marked source="demo".\n` +
        'This script only deletes accounts it created.',
    );
    process.exit(1);
  }
  if (!COMMIT) {
    console.log(`Would delete ${EMAIL} (and its supplier profile).`);
    console.log('\n(DRY RUN — nothing deleted. Add --commit.)');
    return;
  }
  // SupplierProfile cascades on user delete.
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Deleted ${EMAIL}.`);
}

async function create() {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { supplierProfile: true },
  });

  if (existing && existing.supplierProfile && existing.supplierProfile.source !== 'demo') {
    console.error(
      `Refusing: ${EMAIL} already exists and is NOT a demo account\n` +
        `(source="${existing.supplierProfile.source ?? 'null'}"). Pick another --email.`,
    );
    process.exit(1);
  }

  const password = process.env.DEMO_SUPPLIER_PASSWORD || generatePassword();
  const fromEnv = Boolean(process.env.DEMO_SUPPLIER_PASSWORD);

  console.log(`Email          ${EMAIL}`);
  console.log(`Password       ${fromEnv ? '(from DEMO_SUPPLIER_PASSWORD)' : '(generated)'}`);
  console.log(`Stage          10 — every stage open`);
  console.log(`Orientation    countdown left gated (no stage-5 completedAt)`);
  console.log(`Action         ${existing ? 'update existing demo account' : 'create'}`);

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing written. Add --commit.)');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: 'Demo Supplier' },
    create: {
      email: EMAIL,
      passwordHash,
      name: 'Demo Supplier',
      // A supplier is any account holding a SupplierProfile — never ADMIN.
      role: 'CUSTOMER',
    },
  });

  await prisma.supplierProfile.upsert({
    where: { userId: user.id },
    update: { currentStage: 10, status: 'ACTIVE', source: 'demo' },
    create: {
      userId: user.id,
      companyName: 'Afrizonemart Demo Supplier',
      contactName: 'Demo Supplier',
      country: 'Nigeria',
      category: 'Food & Beverage',
      currentStage: 10,
      status: 'ACTIVE',
      source: 'demo',
    },
  });

  console.log('\n✓ Demo supplier ready.');
  console.log(`   Sign in   https://afrizonemart.com/supplier/login`);
  console.log(`   Email     ${EMAIL}`);
  if (!fromEnv) {
    console.log(`   Password  ${password}`);
    console.log('\n   ^ shown once and not recoverable — copy it now.');
    console.log('     Re-run to set a new one; the old password stops working.');
  }
  console.log('\nRemove it after the demo:');
  console.log(`   npx tsx scripts/create-demo-supplier.ts --commit --remove --email=${EMAIL}`);
}

(REMOVE ? remove() : create())
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
