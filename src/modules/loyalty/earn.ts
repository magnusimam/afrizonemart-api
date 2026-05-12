import { LoyaltyTransactionType } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import {
  applyLoyaltyTransaction,
  coinsPerOrderForTier,
  getLoyaltyConfig,
  getOrCreateAccountForUser,
  tierForSpend,
  type LoyaltyConfigSnapshot,
} from './service';

/**
 * Continental Rewards earn flow (PR 2).
 *
 * On `order.paid`, this function:
 *   1. Loads the user that placed the order + the order's product
 *      subtotal (excludes shipping).
 *   2. Gets-or-creates the LoyaltyAccount. If it's brand new
 *      (`createdAt == enrolledAt` and no prior transactions), this
 *      is the first paid order → fire the welcome bonus too.
 *   3. Recomputes rolling-window spend including the *new* order so
 *      the tier reflects "this paying customer with this order".
 *      Updates the cached `currentTier` if changed.
 *   4. Issues an `EARN` ledger entry for the per-order coin amount
 *      at the (now-recomputed) tier.
 *
 * Idempotent on (causeOrderId, type): if a duplicate `order.paid`
 * event fires (cron retry, webhook re-delivery), we check for an
 * existing EARN row tied to this orderId and skip if present. Same
 * for WELCOME_BONUS via the account's `enrolledAt` lock — bonus
 * never double-fires.
 *
 * If the customer paid partly with coins on this order, that
 * portion is *excluded* from spend (set by the future PR 3
 * redemption flow via subtracting the coin-redeem NGN value before
 * we read order.subtotal here). PR 2 alone treats the whole
 * product subtotal as earn-qualifying, which is correct because
 * PR 2 doesn't yet support redemption.
 *
 * Errors here MUST NOT throw upwards — they would break the
 * notifications dispatcher pipeline that fires from the same
 * event. Log and swallow.
 */
export async function awardCoinsForPaidOrder(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        subtotal: true,
        status: true,
      },
    });
    if (!order) {
      logger.warn('loyalty.earn.order_not_found', { orderId });
      return;
    }

    const cfg = await getLoyaltyConfig();

    // Get or create the loyalty account. New accounts start at Blue
    // with 0 coins; the welcome bonus fires below if applicable.
    const account = await getOrCreateAccountForUser(order.userId);

    // Has this order already earned coins? Idempotency guard for
    // duplicate `order.paid` events (Squad webhook retries, manual
    // re-emits during incident recovery, etc.).
    const existingEarn = await prisma.loyaltyTransaction.findFirst({
      where: {
        accountId: account.id,
        causeOrderId: orderId,
        type: LoyaltyTransactionType.EARN,
      },
      select: { id: true },
    });
    if (existingEarn) {
      logger.info('loyalty.earn.skipped_duplicate', {
        orderId,
        accountId: account.id,
        transactionId: existingEarn.id,
      });
      return;
    }

    // Welcome bonus? Account has zero ledger entries means brand-
    // new — fire it now. Check the ledger rather than just
    // `enrolledAt` because admin could have pre-created an account
    // via the admin UI; the welcome bonus should fire when a real
    // first paid order lands, not when an admin opens their drawer.
    const hasAnyTransaction = await prisma.loyaltyTransaction.count({
      where: { accountId: account.id },
    });
    if (hasAnyTransaction === 0 && cfg.welcomeBonusCoins > 0) {
      await applyLoyaltyTransaction({
        accountId: account.id,
        delta: cfg.welcomeBonusCoins,
        type: LoyaltyTransactionType.WELCOME_BONUS,
        causeOrderId: orderId,
        reason: 'First paid order — welcome to Continental Rewards',
        expiresAt: expiryFromNow(cfg),
      });
      logger.info('loyalty.earn.welcome_bonus_awarded', {
        orderId,
        accountId: account.id,
        amount: cfg.welcomeBonusCoins,
      });
    }

    // Recompute tier off rolling-window spend *including* this
    // newly-paid order. This affects the per-order earn rate of THIS
    // earn, which is the intuitive customer experience — "I just
    // qualified for Gold, this order earns at Gold rate".
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - cfg.spendWindowMonths);
    const spendRows = await prisma.order.findMany({
      where: {
        userId: order.userId,
        status: 'PAID',
        createdAt: { gte: windowStart },
      },
      select: { id: true, subtotal: true },
    });
    // Note: order.subtotal already counts toward this if the order
    // is PAID. The current order is PAID by the time order.paid
    // fires (payment service sets status=PAID before emitting).
    const totalSpend = spendRows.reduce((sum, r) => sum + r.subtotal, 0);
    const newTier = tierForSpend(totalSpend, cfg);
    if (newTier !== account.currentTier) {
      await prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: { currentTier: newTier },
      });
      logger.info('loyalty.earn.tier_changed', {
        orderId,
        accountId: account.id,
        from: account.currentTier,
        to: newTier,
        rollingSpend: totalSpend,
      });
    }

    // Earn coins at the (possibly updated) tier.
    const earn = coinsPerOrderForTier(newTier, cfg);
    if (earn > 0) {
      await applyLoyaltyTransaction({
        accountId: account.id,
        delta: earn,
        type: LoyaltyTransactionType.EARN,
        causeOrderId: orderId,
        reason: null,
        expiresAt: expiryFromNow(cfg),
      });
      logger.info('loyalty.earn.coins_awarded', {
        orderId,
        accountId: account.id,
        amount: earn,
        tier: newTier,
        rollingSpend: totalSpend,
      });
    }
  } catch (err) {
    // Swallow so the event-bus pipeline survives. Log loud enough
    // that Sentry alerts on it.
    logger.error('loyalty.earn.failed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}

function expiryFromNow(cfg: LoyaltyConfigSnapshot): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + cfg.coinExpiryMonths);
  return d;
}
