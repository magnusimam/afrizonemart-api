import { PostHog } from 'posthog-node';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';

/**
 * Server-side analytics — PostHog Node.
 *
 * Server truth for the events that matter most for revenue
 * attribution: `order.paid`, `payment.failed`, `order.delivered`.
 * Client-side events from mobile / web cover intent (add-to-cart,
 * checkout-started, order-placed); the server fills in the
 * fact-of-payment + the final delivery confirmation.
 *
 * Keep the event vocabulary 1:1 with the client copies
 * (`afrizonemart-mobile/src/lib/analytics.ts` +
 * `afrizonemart-v2/src/components/providers/AnalyticsProvider.tsx`).
 * Same `cartValueBucket` definition so dashboards group cleanly.
 *
 * **No-PII rule (memory)**: never send email, name, phone, address,
 * absolute Naira amounts, or raw search query text. Use coarse
 * buckets, ids, and category metadata only.
 */

const PROJECT_KEY = env.POSTHOG_API_KEY;
const HOST = env.POSTHOG_HOST;

let client: PostHog | null = null;

export const TRACK = {
  ORDER_PAID: 'order_paid',
  ORDER_DELIVERED: 'order_delivered',
  PAYMENT_FAILED: 'payment_failed',
  USER_REGISTERED: 'user_registered',
  USER_DELETED: 'user_deleted',
} as const;

export type TrackEvent = (typeof TRACK)[keyof typeof TRACK];

export function initServerAnalytics(): void {
  if (!PROJECT_KEY) {
    logger.info('analytics.disabled', {
      reason: 'POSTHOG_API_KEY not set',
    });
    return;
  }
  if (client) return;
  client = new PostHog(PROJECT_KEY, {
    host: HOST,
    /// Batch + flush every 10s — caps egress without making
    /// dashboards feel laggy. The default 30s is too sluggish for
    /// a launch when we're actively watching events arrive.
    flushAt: 20,
    flushInterval: 10_000,
  });
  logger.info('analytics.enabled', { host: HOST });
}

/**
 * Identify the distinct_id as the user id so server events line
 * up with client events. We never send personal traits here — the
 * server has access to email + name, but pushing them to PostHog
 * would mix PII into a third-party tool. Use bucket-style traits
 * if we ever need them.
 */
export function track(
  userId: string,
  event: TrackEvent,
  properties?: Record<string, unknown>,
): void {
  if (!client) return;
  try {
    client.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        source: 'server',
      },
    });
  } catch (err) {
    logger.warn('analytics.capture_failed', {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Coarse cart-value bucket. KEEP 1:1 with the client copies so
 * dashboards group cleanly across the three surfaces.
 */
export function cartValueBucket(ngnSubtotal: number): string {
  if (ngnSubtotal < 1_000) return '<1k';
  if (ngnSubtotal < 5_000) return '1k-5k';
  if (ngnSubtotal < 10_000) return '5k-10k';
  if (ngnSubtotal < 25_000) return '10k-25k';
  if (ngnSubtotal < 50_000) return '25k-50k';
  if (ngnSubtotal < 100_000) return '50k-100k';
  return '100k+';
}

/**
 * Flush on shutdown so we don't lose the last batch of events.
 * Called from the server's SIGTERM handler.
 */
export async function shutdownServerAnalytics(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    logger.warn('analytics.shutdown_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
