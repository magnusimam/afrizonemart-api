/**
 * Re-send the release email for audits that were already authorised.
 *
 *   npx tsx scripts/resend-audit-reports.ts                     # dry run
 *   npx tsx scripts/resend-audit-reports.ts --commit
 *   npx tsx scripts/resend-audit-reports.ts --commit --only=a@x.com,b@y.com
 *
 * `authoriseAudit` refuses to re-notify once `approvedAt` is set, and that is
 * correct: a second verdict email arriving unbidden reads as a second verdict.
 * So a deliberate re-send needs a deliberate tool, and this is it.
 *
 * It exists because the first release went out with the attachment mislabelled
 * `application/pdf` while the file was a .docx — some clients refuse to open an
 * attachment whose declared type contradicts its extension. The verdict, the
 * score and the report are unchanged; only the envelope was wrong.
 *
 * Nothing here re-decides anything. It re-sends the email for an audit that a
 * lead auditor already signed, using the signature and date already on record.
 */
import { PrismaClient } from '@prisma/client';
import { notifyAuditComplete } from '@/modules/suppliers/notify';

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = new Set(
  (onlyArg ? onlyArg.slice('--only='.length) : '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/** Fetch the issued document so it can be attached with the right type. */
async function fetchReport(
  url: string,
  filename: string,
): Promise<{ filename: string; content: Buffer } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return { filename, content: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return null;
  }
}

async function main() {
  const released = await prisma.supplierProfile.findMany({
    where: { audit: { approvedAt: { not: null } } },
    include: { user: { select: { email: true, name: true } }, audit: true },
    orderBy: { companyName: 'asc' },
  });

  const targets = released.filter(
    (s) => ONLY.size === 0 || ONLY.has(s.user.email.toLowerCase()),
  );

  console.log(`released audits: ${released.length}   to re-send: ${targets.length}\n`);
  for (const s of targets) {
    const a = s.audit!;
    console.log(
      `  ${s.companyName.slice(0, 34).padEnd(36)} ${s.user.email.padEnd(34)} ` +
        `${a.outcome} ${a.indicativeScore ?? '?'}  ` +
        `${a.reportFileType ?? 'no file'}`,
    );
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing sent. Add --commit.)');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const s of targets) {
    const a = s.audit!;
    let attachment: { filename: string; content: Buffer; contentType?: string } | undefined;

    if (a.reportFileUrl) {
      const got = await fetchReport(
        a.reportFileUrl,
        a.reportFileName ?? 'Afrizonemart-Diagnostic-Report',
      );
      if (!got) {
        console.log(`  ✗ ${s.companyName} — could not fetch the report document, skipped`);
        failed++;
        continue;
      }
      attachment = { ...got, contentType: a.reportFileType ?? undefined };
    }

    try {
      await notifyAuditComplete({
        to: s.user.email,
        userId: s.userId,
        recipientName: s.user.name ?? s.contactName,
        outcome: (a.outcome ?? 'PROVISIONAL') as 'APPROVED' | 'PROVISIONAL' | 'REJECTED',
        indicativeScore: a.indicativeScore ?? 0,
        reportPdf: attachment,
      });
      console.log(`  ✓ ${s.companyName} — ${s.user.email}`);
      sent++;
    } catch (err) {
      console.log(`  ✗ ${s.companyName} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nRe-sent: ${sent} | failed: ${failed}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
