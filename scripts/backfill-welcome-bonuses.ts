/**
 * 2026-05-16 — one-off backfill for the welcome-bonus-at-signup
 * change. Awards the welcome bonus to every existing User who has
 * either (a) no LoyaltyAccount yet, or (b) a LoyaltyAccount with
 * zero transactions. Idempotent — re-running is safe; rows that
 * already have any transaction are skipped.
 *
 * Run from the API root with the prod DB URL exported:
 *
 *   $ DATABASE_URL=$RAILWAY_DATABASE_URL npx tsx scripts/backfill-welcome-bonuses.ts
 *
 * Or via Railway CLI (uses the service's env):
 *
 *   $ railway run --service api npx tsx scripts/backfill-welcome-bonuses.ts
 *
 * Output reports awarded / skipped counts so it's safe to run
 * repeatedly during the rollout window without burning extra coins.
 */
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import {
  getLoyaltyConfig,
  type LoyaltyConfigSnapshot,
} from '@/modules/loyalty/service';
import { issueWelcomeBonus } from '@/modules/loyalty/welcome-bonus.service';

async function run() {
  const cfg: LoyaltyConfigSnapshot = await getLoyaltyConfig();
  if (cfg.welcomeBonusCoins <= 0) {
    console.log(
      `Welcome bonus is disabled (welcomeBonusCoins=${cfg.welcomeBonusCoins}). Nothing to backfill.`,
    );
    return;
  }

  console.log(
    `Backfilling welcome bonus (${cfg.welcomeBonusCoins} coins each)…`,
  );

  const users = await prisma.user.findMany({
    where: {
      role: { in: ['CUSTOMER', 'SELLER'] },
    },
    select: { id: true, email: true },
  });

  let awarded = 0;
  let skipped = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const result = await issueWelcomeBonus(u.id, cfg);
      if (result.awarded) {
        awarded++;
        console.log(`  ✓ ${u.email}`);
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(
        `  ✗ ${u.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `\nDone. ${awarded} awarded, ${skipped} already had ledger rows, ${failed} failed.`,
  );
  logger.info('loyalty.welcome_bonus.backfill_complete', {
    awarded,
    skipped,
    failed,
    total: users.length,
  });
}

run()
  .catch((err) => {
    console.error('Backfill aborted:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
