import { LoyaltyTransactionType } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { applyLoyaltyTransaction } from './service';

/**
 * Continental Rewards refund clawback (Tracker #44 PR 4).
 *
 * On `order.refunded`, we have two cleanups to consider:
 *
 *  1. **Earned coins** for the refunded order — clawback via
 *     `REFUND_REVERSAL`. Only on FULL refunds. Partial refunds
 *     are skipped because partial-reversal math gets messy
 *     (per-line proration, tier-rate snapshots etc.) and the
 *     dollar value at stake is small. Admin can manually adjust
 *     via the admin UI for partial refunds that need it.
 *
 *  2. **Redeemed coins** the customer paid with — return them
 *     via `REDEEM_REFUND`. Returning the full amount even on a
 *     partial refund is the customer-friendly choice and keeps
 *     the math simple: they get their coins back, and any
 *     remaining order-value the customer is still being charged
 *     for is cash-only.
 *
 * Errors logged + swallowed — must not break the rest of the
 * order.refunded subscriber chain (notifications, etc.).
 */
export async function clawbackOnRefund(input: {
  orderId: string;
  userId: string;
  refundAmount: number;
}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        total: true,
        coinsRedeemed: true,
        coinDiscount: true,
        refundedTotal: true,
      },
    });
    if (!order) {
      logger.warn('loyalty.refund.order_not_found', { orderId: input.orderId });
      return;
    }

    const account = await prisma.loyaltyAccount.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (!account) return; // user never enrolled — nothing to clawback

    // Is this a FULL refund? `refundedTotal` already includes this
    // refund (the admin service updates it inside its tx before
    // emitting the event). If refundedTotal >= total, fully
    // refunded.
    const isFullRefund = order.refundedTotal >= order.total;

    // 1) Earn clawback (full refunds only).
    if (isFullRefund) {
      const earnEntries = await prisma.loyaltyTransaction.findMany({
        where: {
          accountId: account.id,
          causeOrderId: input.orderId,
          type: { in: [LoyaltyTransactionType.EARN, LoyaltyTransactionType.WELCOME_BONUS] },
        },
      });
      for (const entry of earnEntries) {
        // Don't clawback already-expired entries — those coins are
        // gone anyway; clawing back coins the customer never had
        // would push balance negative.
        if (entry.expiredAt) continue;
        // Don't clawback if we already issued a reversal for this
        // entry — defensive against duplicate `order.refunded`
        // events.
        const existing = await prisma.loyaltyTransaction.findFirst({
          where: {
            accountId: account.id,
            causeOrderId: input.orderId,
            type: LoyaltyTransactionType.REFUND_REVERSAL,
          },
        });
        if (existing) {
          logger.info('loyalty.refund.skipped_duplicate_clawback', {
            orderId: input.orderId,
          });
          break;
        }
        try {
          await applyLoyaltyTransaction({
            accountId: account.id,
            delta: -entry.delta,
            type: LoyaltyTransactionType.REFUND_REVERSAL,
            causeOrderId: input.orderId,
            reason: `Reversal of earn for refunded order`,
          });
        } catch (err) {
          // Could throw "insufficient balance" if customer has
          // already redeemed the earned coins. Log + continue —
          // admin can manually adjust if needed.
          logger.warn('loyalty.refund.clawback_failed', {
            orderId: input.orderId,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 2) Return any redeemed coins (any refund, partial or full).
    if (order.coinsRedeemed > 0) {
      const existingReturn = await prisma.loyaltyTransaction.findFirst({
        where: {
          accountId: account.id,
          causeOrderId: input.orderId,
          type: LoyaltyTransactionType.REDEEM_REFUND,
        },
      });
      if (!existingReturn) {
        await applyLoyaltyTransaction({
          accountId: account.id,
          delta: order.coinsRedeemed,
          type: LoyaltyTransactionType.REDEEM_REFUND,
          causeOrderId: input.orderId,
          reason: `Returned coins from refunded order`,
        });
        logger.info('loyalty.refund.coins_returned', {
          orderId: input.orderId,
          coins: order.coinsRedeemed,
        });
      }
    }
  } catch (err) {
    logger.error('loyalty.refund.failed', {
      orderId: input.orderId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
