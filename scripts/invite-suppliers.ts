/**
 * Send "set your password" invites to bulk-imported suppliers.
 *   npx tsx scripts/invite-suppliers.ts            (dry run — lists who'd be invited)
 *   npx tsx scripts/invite-suppliers.ts --commit   (actually send)
 *   npx tsx scripts/invite-suppliers.ts --commit --only=email@x.com  (single test)
 *
 * In dev (no RESEND_API_KEY) the Console email provider prints the email +
 * the set-password URL to stdout — perfect for previewing without sending.
 */
import { prisma } from '@/infra/prisma';
import { sendSupplierInvite } from '@/modules/suppliers/invite.service';

const COMMIT = process.argv.includes('--commit');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;

async function main() {
  const suppliers = await prisma.supplierProfile.findMany({
    where: { source: 'sheet-import' },
    include: { user: true },
    orderBy: { companyName: 'asc' },
  });
  let targets = suppliers.filter((s) => s.user?.email);
  if (only) targets = targets.filter((s) => s.user.email.toLowerCase() === only);

  console.log(`Imported suppliers with email: ${targets.length}${only ? ` (filtered to ${only})` : ''}`);

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing sent. Add --commit to send.)');
    targets.slice(0, 12).forEach((s) => console.log(`   • ${s.companyName} — ${s.user.email}`));
    if (targets.length > 12) console.log(`   … and ${targets.length - 12} more`);
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const s of targets) {
    try {
      await sendSupplierInvite(s.userId);
      sent++;
    } catch (err) {
      failed++;
      console.error(`   ✗ ${s.user.email}: ${(err as Error).message}`);
    }
  }
  console.log(`\nInvites sent: ${sent} | failed: ${failed}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
