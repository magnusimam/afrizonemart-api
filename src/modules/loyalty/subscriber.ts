import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { awardCoinsForPaidOrder } from './earn';
import { clawbackOnRefund } from './refund';
import { awardWelcomeBonusOnSignup } from './welcome-bonus.service';

/**
 * Wire the loyalty event-bus subscribers. Called once at API boot
 * from `server.ts` (Principle #5 — event-driven side effects).
 *
 * Loyalty is a *passive subscriber* — it never publishes events
 * itself. PR 3 hooks into placeOrder directly (redemption needs
 * to happen synchronously inside the order transaction, not via
 * an async event).
 *
 * Subscribers wired here:
 *  - `order.paid` → awardCoinsForPaidOrder (PR 2)
 *  - `order.refunded` → clawbackOnRefund (PR 4)
 */
export function startLoyaltyEarnSubscriber(): void {
  eventBus.on('order.paid', async ({ orderId }) => {
    await awardCoinsForPaidOrder(orderId);
  });
  eventBus.on('order.refunded', async ({ orderId, userId, amount }) => {
    await clawbackOnRefund({ orderId, userId, refundAmount: amount });
  });
  /// 2026-05-16 bugfix — welcome bonus moved to signup. Was firing
  /// on first paid order; customers expected it at signup as the
  /// incentive to register. earn.ts still has the same idempotent
  /// check as a fallback for any user who registered before this
  /// subscriber existed.
  eventBus.on('user.registered', async ({ userId }) => {
    await awardWelcomeBonusOnSignup(userId);
  });
  logger.info('loyalty.subscriber.started');
}
