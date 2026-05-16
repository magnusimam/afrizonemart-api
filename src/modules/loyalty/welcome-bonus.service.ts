import { LoyaltyTransactionType } from '@prisma/client';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import {
  applyLoyaltyTransaction,
  getLoyaltyConfig,
  getOrCreateAccountForUser,
  type LoyaltyConfigSnapshot,
} from './service';

/**
 * Tracker bugfix 2026-05-16 — award the Continental Rewards welcome
 * bonus at SIGNUP rather than waiting for first paid order.
 *
 * The original PR 2 design (memory: project_continental_rewards_complete)
 * fired the bonus from inside the `order.paid` earn handler the first
 * time an account had no prior ledger entries. That matched a
 * "loyalty starts when you actually spend" mental model, but every
 * other major retail loyalty program — and Magnus' expectation —
 * gives the bonus on signup as the incentive to register in the
 * first place.
 *
 * Idempotency: we only insert the WELCOME_BONUS row when the account
 * has zero LoyaltyTransaction rows. If signup re-fires (event bus
 * retry, race with an admin pre-create, etc.) the second call sees
 * existing rows and no-ops.
 *
 * Errors are swallowed so a failure here can't break the auth
 * pipeline that emitted the event.
 */
export async function awardWelcomeBonusOnSignup(userId: string): Promise<void> {
  try {
    const cfg = await getLoyaltyConfig();
    if (cfg.welcomeBonusCoins <= 0) {
      // Admin disabled the bonus via /admin/loyalty/config — nothing
      // to do, but log so the marketing team can sanity-check.
      logger.info('loyalty.welcome_bonus.disabled', { userId });
      return;
    }
    await issueWelcomeBonus(userId, cfg);
  } catch (err) {
    logger.error('loyalty.welcome_bonus.failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}

/// Shared implementation used both by the signup subscriber AND by
/// the earn-time fallback in `earn.ts` (for legacy users who signed
/// up before this change). Idempotent on "account has zero ledger
/// rows".
export async function issueWelcomeBonus(
  userId: string,
  cfg: LoyaltyConfigSnapshot,
): Promise<{ awarded: boolean; accountId: string }> {
  const account = await getOrCreateAccountForUser(userId);

  const hasAnyTransaction = await prisma.loyaltyTransaction.count({
    where: { accountId: account.id },
  });
  if (hasAnyTransaction > 0) {
    return { awarded: false, accountId: account.id };
  }

  await applyLoyaltyTransaction({
    accountId: account.id,
    delta: cfg.welcomeBonusCoins,
    type: LoyaltyTransactionType.WELCOME_BONUS,
    causeOrderId: null,
    reason: 'Welcome to Continental Rewards',
    expiresAt: welcomeExpiry(cfg),
  });
  logger.info('loyalty.welcome_bonus.awarded', {
    userId,
    accountId: account.id,
    amount: cfg.welcomeBonusCoins,
  });
  return { awarded: true, accountId: account.id };
}

function welcomeExpiry(cfg: LoyaltyConfigSnapshot): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + cfg.coinExpiryMonths);
  return d;
}
