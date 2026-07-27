/**
 * Mint (or rotate) a service token for a machine API consumer.
 *
 *   npx tsx scripts/create-service-token.ts --name=billie-voice-assistant \
 *     --scopes=suppliers.read
 *
 * Flags:
 *   --name=<label>        required, unique. Re-running with the same name
 *                         ROTATES the token (old one stops working).
 *   --scopes=a,b          comma-separated scope list. Default: suppliers.read
 *   --write               allow non-GET requests (default is read-only)
 *   --expires=<days>      optional expiry in days (default: never)
 *   --revoke              revoke the named token instead of creating one
 *
 * The plaintext token is printed ONCE and never stored — only its SHA-256
 * hash goes to the database. If it's lost, rotate; it cannot be recovered.
 */
import { prisma } from '../src/infra/prisma';
import { generateServiceToken, hashServiceToken } from '../src/middleware/service-token';

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const name = flag('name');
  if (!name) {
    console.error('Missing --name=<label>. See the header of this file for usage.');
    process.exit(1);
  }

  if (has('revoke')) {
    const updated = await prisma.serviceToken.updateMany({
      where: { name, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(
      updated.count > 0
        ? `Revoked service token "${name}". It will be rejected immediately.`
        : `No active token named "${name}".`,
    );
    return;
  }

  const scopes = (flag('scopes') ?? 'suppliers.read')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const readOnly = !has('write');
  const expiresDays = flag('expires') ? Number(flag('expires')) : undefined;
  const expiresAt =
    expiresDays && Number.isFinite(expiresDays)
      ? new Date(Date.now() + expiresDays * 86_400_000)
      : null;

  const token = generateServiceToken();
  const tokenHash = hashServiceToken(token);

  await prisma.serviceToken.upsert({
    where: { name },
    // Rotation: new secret, refreshed scopes, and un-revoke.
    update: { tokenHash, scopes, readOnly, expiresAt, revokedAt: null },
    create: { name, tokenHash, scopes, readOnly, expiresAt },
  });

  console.log('');
  console.log('  -------------------------------------------------------------');
  console.log(`  Service token for: ${name}`);
  console.log(`  Scopes:   ${scopes.join(', ')}`);
  console.log(`  Access:   ${readOnly ? 'READ-ONLY (GET requests only)' : 'READ-WRITE'}`);
  console.log(`  Expires:  ${expiresAt ? expiresAt.toISOString() : 'never (revoke manually)'}`);
  console.log('  -------------------------------------------------------------');
  console.log('');
  console.log('  TOKEN (shown once - copy it now):');
  console.log('');
  console.log(`      ${token}`);
  console.log('');
  console.log('  Store it as an environment variable in the consumer.');
  console.log('  Do NOT commit it to any repo.');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
