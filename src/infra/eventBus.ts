import { logger } from './logger';

/**
 * In-process event bus (Principle #5 — Event-Driven Architecture).
 *
 * Modules emit domain events; other modules subscribe. Adding a feature is
 * "subscribe to an event", never "edit the existing checkout code".
 *
 * This is intentionally tiny. When we outgrow it (cross-process events,
 * retries, dead-letter queues) we'll swap the implementation for Redis
 * Streams or RabbitMQ — the call sites don't change.
 *
 * To add a new event type, append to `EventMap`.
 */
export interface EventMap {
  'order.placed': {
    orderId: string;
    userId: string;
    total: number;
    currency: 'NGN' | 'USD' | 'GBP';
    placedAt: string;
  };
  'order.paid': {
    orderId: string;
    paymentId: string;
    method: string;
    /// Where the PAID flip came from: gateway webhook, the post-redirect
    /// verifyPayment poll, or an admin marking it manually (e.g. after a
    /// bank-transfer confirmation). Useful for analytics + so subscribers
    /// can branch ("admin-confirmed bank transfer" emails should look
    /// slightly different from "Squad webhook said yes").
    source: 'gateway_webhook' | 'verify_redirect' | 'admin' | 'reconciliation_cron';
  };
  /// Tracker #47 — terminal "payment didn't go through" signal. Fires
  /// when the gateway reports FAILED (or, in future, when a customer
  /// abandons the gateway page and a sweeper picks it up). Lets us
  /// email the customer a "try again" + ping admin.
  'payment.failed': {
    orderId: string;
    paymentId: string;
    method: string;
    /// Gateway-reported reason if available. Goes straight into the
    /// customer's email + admin notification so we don't have to guess
    /// when a card BIN gets rejected.
    reason?: string | null;
    source: 'gateway_webhook' | 'verify_redirect' | 'reconciliation_cron';
  };
  'order.shipped': {
    orderId: string;
    userId: string;
    carrier?: string;
    trackingNumber?: string;
  };
  'order.delivered': {
    orderId: string;
    userId: string;
  };
  'password.reset_requested': {
    userId: string;
    email: string;
    resetUrl: string;
    expiresInMinutes: number;
  };
  'cart.abandoned': {
    userId: string;
    cartId: string;
    itemCount: number;
    total: number;
  };
  'product.viewed': {
    productId: string;
    userId?: string;
  };
  'cart.updated': {
    userId: string;
    itemCount: number;
  };
  'user.registered': {
    userId: string;
    email: string;
  };
  'user.logged_in': {
    userId: string;
    email: string;
  };
  'order.cancelled': {
    orderId: string;
    userId: string;
    reason?: string;
  };
  'order.refunded': {
    orderId: string;
    userId: string;
    amount: number;
    reason?: string;
  };
  'order.note_added': {
    orderId: string;
    userId: string;
    isCustomerVisible: boolean;
  };
  /// 2026-05-16 — Phase 2 referral payout signal. Fires after the
  /// loyalty cron credits a referrer's PAID_OUT row. Notification
  /// dispatcher hooks here to email the referrer ("You earned X coins
  /// for referring a friend"); analytics may also subscribe.
  'referral.paid_out': {
    referralId: string;
    referrerUserId: string;
    refereeUserId: string;
    coins: number;
  };
}

type Handler<K extends keyof EventMap> = (
  payload: EventMap[K],
) => void | Promise<void>;

class EventBus {
  private handlers: Map<keyof EventMap, Array<Handler<keyof EventMap>>> = new Map();

  on<K extends keyof EventMap>(event: K, handler: Handler<K>): void {
    const list = (this.handlers.get(event) ?? []) as Array<Handler<K>>;
    list.push(handler);
    this.handlers.set(event, list as never);
    logger.debug('eventBus.subscribed', { event, handlerCount: list.length });
  }

  async emit<K extends keyof EventMap>(
    event: K,
    payload: EventMap[K],
  ): Promise<void> {
    const handlers = (this.handlers.get(event) ?? []) as Array<Handler<K>>;
    logger.info('eventBus.emit', {
      event,
      handlerCount: handlers.length,
      payload,
    });
    await Promise.all(
      handlers.map(async (h) => {
        try {
          await h(payload);
        } catch (error) {
          logger.error('eventBus.handler_failed', { event, error });
        }
      }),
    );
  }
}

export const eventBus = new EventBus();
