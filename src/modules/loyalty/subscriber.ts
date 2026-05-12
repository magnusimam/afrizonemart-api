import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { awardCoinsForPaidOrder } from './earn';
import { clawbackOnRefund } from './refund';

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
  logger.info('loyalty.subscriber.started');
}
