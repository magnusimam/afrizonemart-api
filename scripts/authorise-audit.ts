/**
 * Authorise a completed audit, releasing the report to the supplier.
 *
 *   npx tsx scripts/authorise-audit.ts --email=a@b.com --signed-by="Full Name"
 *   npx tsx scripts/authorise-audit.ts --email=a@b.com --signed-by="Full Name" --commit
 *
 * This is the same call the admin UI makes — `authoriseAudit` — not a shortcut
 * around it. That matters: the signature, the release timestamp, the supplier
 * email and the QA copy all have to happen together, and writing `approvedAt`
 * straight to the database would set the flag while sending nobody anything.
 *
 * `--signed-by` is a person's legal attestation that they have read the report
 * and stand behind its verdict. It is required, never defaulted, and whoever
 * runs this must be entitled to type that name.
 */
import { PrismaClient } from '@prisma/client';
import { authoriseAudit } from '@/modules/suppliers/admin.audit.service';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const arg = (n: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

async function main() {
  const emails = (arg('email') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const signedBy = (arg('signed-by') ?? '').trim();

  if (!emails.length || signedBy.length < 3) {
    console.error('Usage: --email=a@b.com[,c@d.com] --signed-by="Full Name" [--commit]');
    process.exit(1);
  }

  // The release is recorded against a real admin account, so the audit trail
  // names a person rather than a script.
  const approver = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, email: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!approver) {
    console.error('No admin account found to record the approval against.');
    process.exit(1);
  }

  for (const email of emails) {
    const s = await prisma.supplierProfile.findFirst({
      where: { user: { email } },
      include: { user: { select: { email: true } }, audit: true },
    });
    if (!s?.audit) {
      console.log(`  skip  ${email} — no audit`);
      continue;
    }
    if (s.audit.approvedAt) {
      console.log(`  skip  ${s.companyName} — already authorised on ${s.audit.approvedAt.toISOString().slice(0, 10)}`);
      continue;
    }
    console.log(
      `  ${COMMIT ? 'AUTHORISE' : 'would authorise'}  ${s.companyName} — ` +
        `${s.audit.outcome} ${s.audit.indicativeScore ?? '?'} — signed by ${signedBy}`,
    );
    if (!COMMIT) continue;

    await authoriseAudit(s.id, { signedBy }, approver.id);
    console.log(`     ✓ released, email sent to ${s.user.email}`);
  }

  if (!COMMIT) console.log('\n(DRY RUN — nothing released. Add --commit.)');
  else console.log(`\nRecorded against ${approver.email} (${approver.role}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
