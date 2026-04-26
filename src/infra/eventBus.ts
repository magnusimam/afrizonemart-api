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
  };
  'order.shipped': {
    orderId: string;
    carrier: string;
    trackingNumber: string;
  };
  'product.viewed': {
    productId: string;
    userId?: string;
  };
  'cart.updated': {
    userId: string;
    itemCount: number;
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
