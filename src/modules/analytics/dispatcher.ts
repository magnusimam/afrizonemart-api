import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { TRACK, cartValueBucket, track } from './analytics';

/**
 * Bridges domain events → PostHog server-side captures.
 *
 * Separate dispatcher file from email + WhatsApp + push so each
 * surface has its own failure mode + its own opt-in gate. Mounted
 * once at server boot via `startAnalyticsDispatcher()`.
 *
 * Events we capture server-side:
 *   - `order.paid`      → 'order_paid'      (source-of-truth for revenue)
 *   - `payment.failed`  → 'payment_failed'  (conversion-loss signal)
 *   - `order.delivered` → 'order_delivered' (LTV signal)
 *   - `user.registered` → 'user_registered' (signup truth — covers all
 *                          paths including phone OTP that don't
 *                          fire a client-side event)
 *   - `user.deleted`    → 'user_deleted'    (churn signal)
 *
 * Properties never include PII (no email, name, phone, address,
 * absolute Naira). Coarse buckets via `cartValueBucket`.
 */
export function startAnalyticsDispatcher(): void {
  logger.info('analytics.dispatcher_enabled');

  eventBus.on('order.paid', async ({ orderId, method, source }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          orderNumber: true,
          total: true,
          currency: true,
          paymentMethod: true,
          items: { select: { id: true } },
        },
      });
      if (!order) return;
      track(order.userId, TRACK.ORDER_PAID, {
        order_id: order.id,
        order_number: order.orderNumber,
        payment_method: order.paymentMethod,
        flip_method: method,
        flip_source: source,
        item_count: order.items.length,
        total_bucket: cartValueBucket(order.total),
        currency: order.currency,
      });
    } catch (err) {
      logger.warn('analytics.order_paid_failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  eventBus.on('payment.failed', async ({ orderId, method, reason }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, total: true },
      });
      if (!order) return;
      track(order.userId, TRACK.PAYMENT_FAILED, {
        order_id: order.id,
        payment_method: method,
        /// Reason is bounded by gateway response strings — log a
        /// short slug so dashboards group recurring failure modes
        /// (e.g. "Insufficient funds", "Card declined") without
        /// turning into freeform text noise.
        reason: reason ? reason.slice(0, 80) : null,
        total_bucket: cartValueBucket(order.total),
      });
    } catch (err) {
      logger.warn('analytics.payment_failed_failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  eventBus.on('order.delivered', async ({ orderId, source }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, total: true, createdAt: true },
      });
      if (!order) return;
      const daysToDeliver = Math.floor(
        (Date.now() - order.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      track(order.userId, TRACK.ORDER_DELIVERED, {
        order_id: order.id,
        confirmation_source: source,
        total_bucket: cartValueBucket(order.total),
        days_to_deliver: daysToDeliver,
      });
    } catch (err) {
      logger.warn('analytics.order_delivered_failed', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  eventBus.on('user.registered', async ({ userId }) => {
    track(userId, TRACK.USER_REGISTERED, {
      /// Auth path isn't on the payload; the client-side event
      /// already carries method=email|google|phone. Server-side
      /// rows act as a backstop in case the client event is lost.
    });
  });

  eventBus.on('user.deleted', async ({ userId }) => {
    track(userId, TRACK.USER_DELETED);
  });
}
