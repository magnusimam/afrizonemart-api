/**
 * Send "set your password" invites to bulk-imported suppliers.
 *   npx tsx scripts/invite-suppliers.ts            (dry run — lists who'd be invited)
 *   npx tsx scripts/invite-suppliers.ts --commit   (actually send)
 *
 * Targeting a subset — the usual mode when you are inviting people who are
 * standing in front of you and can be helped if a link misbehaves:
 *   --only=a@x.com                    single address
 *   --only=a@x.com,b@y.com,c@z.com    comma-separated list
 *   --only-file=data/imports/wave1.csv  a file of addresses
 *   --limit=20                        cap the send (applied after --only)
 *
 * `--only-file` takes one address per line, or a CSV with an `email` column;
 * blank lines, `#` comments and a header row are ignored. Addresses that match
 * no imported supplier are reported rather than silently dropped — a typo in a
 * wave list would otherwise look identical to a successful send.
 *
 * In dev (no RESEND_API_KEY) the Console email provider prints the email +
 * the set-password URL to stdout — perfect for previewing without sending.
 */
import fs from 'node:fs';
import { prisma } from '@/infra/prisma';
import { sendSupplierInvite } from '@/modules/suppliers/invite.service';

const COMMIT = process.argv.includes('--commit');

const argValue = (flag: string): string | null => {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : null;
};

const splitEmails = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && !e.startsWith('#'));

/** One address per line, or a CSV with an `email` column. */
function readOnlyFile(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return [];

  // A CSV with headers: find the email column and read it. Anything else is
  // treated as a plain list, which also covers a single-column CSV.
  const header = lines[0].toLowerCase().split(',').map((c) => c.trim());
  const emailCol = header.findIndex((c) => c === 'email');
  if (emailCol !== -1 && header.length > 1) {
    return lines.slice(1).flatMap((l) => splitEmails(l.split(',')[emailCol] ?? ''));
  }
  const body = emailCol !== -1 ? lines.slice(1) : lines;
  return body.flatMap(splitEmails);
}

const onlyRaw = argValue('--only');
const onlyFile = argValue('--only-file');
const limitRaw = argValue('--limit');
const limit = limitRaw ? Number(limitRaw) : null;

if (limitRaw && (!Number.isInteger(limit) || limit! < 1)) {
  console.error(`--limit must be a positive whole number (got "${limitRaw}")`);
  process.exit(1);
}

const requested = new Set<string>([
  ...(onlyRaw ? splitEmails(onlyRaw) : []),
  ...(onlyFile ? readOnlyFile(onlyFile) : []),
]);

async function main() {
  // The default cohort is the bulk-imported suppliers. But naming an address
  // explicitly is a different intent from "invite the cohort", so explicit
  // targeting searches every supplier profile: without this, a smoke test
  // against your own account matches nothing and reports a successful send of
  // zero emails -- the one result that looks identical to it having worked.
  const suppliers = await prisma.supplierProfile.findMany({
    where: requested.size ? {} : { source: 'sheet-import' },
    include: { user: true },
    orderBy: { companyName: 'asc' },
  });

  const withEmail = suppliers.filter((s) => s.user?.email);
  let targets = withEmail;

  if (requested.size) {
    targets = withEmail.filter((s) => requested.has(s.user.email.toLowerCase()));

    // Loudly, because an unmatched address at an event means a real person is
    // waiting for an email that is never going to arrive.
    const matched = new Set(targets.map((s) => s.user.email.toLowerCase()));
    const unmatched = [...requested].filter((e) => !matched.has(e));
    if (unmatched.length) {
      console.warn(`\n⚠ ${unmatched.length} requested address(es) matched no imported supplier:`);
      unmatched.forEach((e) => console.warn(`   • ${e}`));
      console.warn('   (wrong address, or they signed up themselves rather than being imported)\n');
    }
  }

  if (limit && targets.length > limit) {
    console.log(`Capping at --limit=${limit} (${targets.length} matched).`);
    targets = targets.slice(0, limit);
  }

  const scope = requested.size ? ` (filtered to ${requested.size} requested)` : '';
  console.log(`Imported suppliers with email: ${withEmail.length} | to invite: ${targets.length}${scope}`);

  if (!targets.length) {
    console.log('\nNothing to send.');
    return;
  }

  if (!COMMIT) {
    console.log('\n(DRY RUN — nothing sent. Add --commit to send.)');
    const preview = requested.size || limit ? targets : targets.slice(0, 12);
    preview.forEach((s) => console.log(`   • ${s.companyName} — ${s.user.email}`));
    if (preview.length < targets.length) console.log(`   … and ${targets.length - preview.length} more`);
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const s of targets) {
    try {
      await sendSupplierInvite(s.userId);
      sent++;
      // Logged per send, not just totalled: when you are working a room you
      // need to know whose invite has already gone out.
      console.log(`   ✓ ${s.companyName} — ${s.user.email}`);
    } catch (err) {
      failed++;
      console.error(`   ✗ ${s.companyName} — ${s.user.email}: ${(err as Error).message}`);
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
