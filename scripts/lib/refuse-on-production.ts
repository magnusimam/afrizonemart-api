/**
 * Guard for scripts that must never touch a production database.
 *
 * The seed scripts previously guarded on `NODE_ENV === 'production'` alone,
 * which protects nothing that matters: `NODE_ENV` describes the *shell*, not
 * the database it is pointed at. A developer running a seed locally with a
 * production `DATABASE_URL` in their environment — a copied `.env`, an
 * exported var left over from a migration — passes that check and writes demo
 * accounts, with passwords published in the source, straight into production.
 *
 * So the real subject of the check is the connection string. The rule is an
 * allowlist rather than a blocklist: only a database on the local machine is
 * assumed safe, because a blocklist of known production hosts is exactly the
 * kind of list that goes stale the first time infrastructure moves.
 */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  'postgres', // docker-compose service name
  'db',
]);

/** The host of `DATABASE_URL`, or null when it is unset or unparseable. */
export function databaseHost(url = process.env.DATABASE_URL): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLocalDatabase(url = process.env.DATABASE_URL): boolean {
  const host = databaseHost(url);
  return host !== null && LOCAL_HOSTS.has(host);
}

/**
 * Abort unless we are clearly pointed at a local database.
 *
 * `--yes-seed-demo` is the deliberate override for the one legitimate remote
 * case (a shared staging box). It is a long flag on purpose: it should be
 * awkward enough that nobody types it by reflex.
 *
 * @param scriptName shown in the refusal so the operator knows what stopped.
 */
export function refuseOnProduction(scriptName: string): void {
  const override = process.argv.includes('--yes-seed-demo');
  const host = databaseHost();
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv === 'production' && !override) {
    console.error(
      `Refusing to run ${scriptName}: NODE_ENV=production.\n` +
        'This seed creates demo accounts whose passwords are published in the\n' +
        'source. See PRODUCTION_CUTOVER.md §8.',
    );
    process.exit(1);
  }

  if (!host) {
    console.error(
      `Refusing to run ${scriptName}: DATABASE_URL is unset or unparseable, so\n` +
        'there is no way to tell which database this would write to.',
    );
    process.exit(1);
  }

  if (!isLocalDatabase() && !override) {
    console.error(
      `Refusing to run ${scriptName}: DATABASE_URL points at "${host}", which is\n` +
        'not a local database. This seed creates accounts with passwords published\n' +
        'in the source — running it against a shared or production database is a\n' +
        'live vulnerability.\n\n' +
        'If you genuinely mean to seed that database, re-run with --yes-seed-demo.',
    );
    process.exit(1);
  }

  if (override) {
    console.warn(
      `⚠ ${scriptName}: --yes-seed-demo given; seeding "${host}" despite it not\n` +
        '  being a local database. Demo accounts use passwords published in the source.',
    );
  }
}
