import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { autoMarkDelivered } from './service';

/**
 * Auto-mark backstop — flips long-stale SHIPPED / OUT_FOR_DELIVERY
 * orders to DELIVERED so the bucket doesn't grow forever.
 *
 * 14 days is conservative: NG last-mile averages 3-7 days; a parcel
 * still in transit at day 14 is almost certainly delivered with the
 * customer just forgetting to confirm. Downstream email + push
 * subscribers skip the celebratory "your order arrived" surface
 * when source === 'auto' (the customer never actually confirmed; a
 * "thanks for your order" message 14 days later would look broken).
 *
 * Runs every 6 hours. First sweep 30s after server boot — long
 * enough for the migrate-deploy to finish but short enough to be
 * useful on a fresh deploy.
 */
const STALE_THRESHOLD_DAYS = 14;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;
const BATCH_LIMIT = 100;

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const cutoff = new Date(
      Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    );
    /// Find candidates by `updatedAt` rather than a dedicated
    /// shippedAt — the order's status was last touched when it
    /// went SHIPPED / OUT_FOR_DELIVERY, so `updatedAt` is a good
    /// proxy. False positives (admin edited the order at day 13
    /// for an unrelated reason) just delay the auto-mark by a few
    /// hours — acceptable.
    const candidates = await prisma.order.findMany({
      where: {
        status: { in: ['SHIPPED', 'OUT_FOR_DELIVERY'] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
      take: BATCH_LIMIT,
    });

    if (candidates.length === 0) {
      logger.info('courier.auto_mark.no_candidates');
      return;
    }

    let flipped = 0;
    for (const { id } of candidates) {
      try {
        await autoMarkDelivered(id);
        flipped++;
      } catch (err) {
        logger.error('courier.auto_mark.row_failed', {
          orderId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info('courier.auto_mark.swept', {
      candidates: candidates.length,
      flipped,
    });
  } catch (err) {
    logger.error('courier.auto_mark.sweep_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startCourierAutoMarkCron(): void {
  setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('courier.auto_mark.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    thresholdDays: STALE_THRESHOLD_DAYS,
  });
}
