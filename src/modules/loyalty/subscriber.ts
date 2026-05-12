import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { awardCoinsForPaidOrder } from './earn';

/**
 * Wire the loyalty earn flow to the event bus. Called once at API
 * boot from `server.ts` (Principle #5 — event-driven side effects).
 *
 * Loyalty is a *passive subscriber* — it never publishes events
 * itself. PR 4 will add `order.refunded` for clawback. PR 3 hooks
 * into the placeOrder flow directly (redemption needs to happen
 * synchronously inside the order transaction, not via an async
 * event).
 */
export function startLoyaltyEarnSubscriber(): void {
  eventBus.on('order.paid', async ({ orderId }) => {
    await awardCoinsForPaidOrder(orderId);
  });
  logger.info('loyalty.subscriber.started');
}
