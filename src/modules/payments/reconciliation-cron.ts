import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { reconcilePendingOrder } from './service';

/**
 * 2026-05-16 — payment reconciliation cron.
 *
 * **Why this exists:** payments can land on the gateway but never
 * make it back to our DB through either the webhook (gateway didn't
 * fire, signature failed, network blip, our webhook URL not
 * configured at the gateway dashboard) or the post-redirect verify
 * (customer closed the success page early, network blip, etc.). When
 * both safety nets miss, the order sits at PENDING_PAYMENT forever
 * even though the customer has paid.
 *
 * This sweeper is the third safety net. Every `SWEEP_INTERVAL_MS` it
 * finds every PENDING_PAYMENT order with an INITIATED Payment row
 * placed more than `MIN_AGE_MS` ago, asks the gateway "is this paid?",
 * and applies whatever the gateway says. Idempotent — orders that
 * have already moved on are skipped by `reconcilePendingOrder`.
 *
 * The cron is the *guarantee* layer. Webhooks and verify are speed
 * layers (sub-second flip). The cron is the catch-all that ensures
 * worst-case latency is bounded by SWEEP_INTERVAL_MS regardless of
 * any other failure.
 *
 * Idempotency:
 *   - reconcilePendingOrder skips orders that aren't PENDING_PAYMENT
 *   - applyWebhookOutcome's status check skips already-SUCCEEDED
 *     payments
 *   - InboundWebhookEvent replay guard not applicable here (we don't
 *     post a body); duplicate verify calls just hit the gateway twice
 *     and the second one no-ops
 */

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const MIN_AGE_MS = 2 * 60 * 1000; // skip very-fresh orders so we don't
                                  // race the user's own verify call
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — older PENDINGs
                                            // are likely abandoned
                                            // (cookie expired etc.);
                                            // gateway verify still
                                            // succeeds though.
const PER_SWEEP_LIMIT = 50; // bound work per tick

export function startPaymentReconciliationCron(): void {
  const intervalMs = SWEEP_INTERVAL_MS;
  setInterval(() => {
    void sweep().catch((err) => {
      logger.error('payments.reconciliation.sweep_crashed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
  logger.info('payments.reconciliation.cron_started', {
    intervalMs,
    minAgeMs: MIN_AGE_MS,
    maxAgeMs: MAX_AGE_MS,
    perSweepLimit: PER_SWEEP_LIMIT,
  });
}

async function sweep(): Promise<void> {
  const now = Date.now();
  const cutoffRecent = new Date(now - MIN_AGE_MS);
  const cutoffOld = new Date(now - MAX_AGE_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      createdAt: { lt: cutoffRecent, gt: cutoffOld },
      payments: { some: { status: 'INITIATED' } },
    },
    select: { id: true, orderNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: PER_SWEEP_LIMIT,
  });

  if (orders.length === 0) return;

  let flipped = 0;
  let stillPending = 0;
  let errored = 0;
  for (const o of orders) {
    try {
      const result = await reconcilePendingOrder(o.id, 'reconciliation_cron');
      if (result.changed) flipped++;
      else stillPending++;
    } catch (err) {
      errored++;
      logger.warn('payments.reconciliation.order_failed', {
        orderId: o.id,
        orderNumber: o.orderNumber,
        ageMs: now - o.createdAt.getTime(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('payments.reconciliation.sweep_complete', {
    scanned: orders.length,
    flipped,
    stillPending,
    errored,
  });
}
