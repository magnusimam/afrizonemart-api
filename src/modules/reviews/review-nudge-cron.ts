import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';

/**
 * 24-hour-after-delivery review-nudge cron.
 *
 * Scans for DELIVERED orders that were confirmed 24-48h ago by a
 * non-auto path (rider scan, customer self-confirm, admin flip)
 * and haven't yet had a `REVIEW_NUDGE_SENT` event recorded. Emits
 * `order.review_nudge_due` — the push dispatcher subscribes and
 * fires the "rate your items" notification.
 *
 * Idempotency: a `REVIEW_NUDGE_SENT` OrderEvent row is written
 * AFTER successful emit so a flaky run can't re-nudge a customer.
 * The window (24-48h, not just "older than 24h") puts an upper
 * bound on how stale a nudge can be — if the cron is down for a
 * week and recovers, we don't suddenly fire a week's worth of
 * reminders for orders that were delivered days ago.
 *
 * Sweep cadence: hourly. Window = 24-48h, so even a missed sweep
 * is recoverable on the next one.
 *
 * Skip path: orders where `deliveredSource = 'auto'` (the 14-day
 * backstop) — those customers never confirmed in the first place,
 * so prompting them to rate would look broken.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
const STARTUP_DELAY_MS = 90 * 1000;
const BATCH_LIMIT = 200;

const NUDGE_LOWER_MS = 24 * 60 * 60 * 1000;
const NUDGE_UPPER_MS = 48 * 60 * 60 * 1000;

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Date.now();
    const lower = new Date(now - NUDGE_UPPER_MS);
    const upper = new Date(now - NUDGE_LOWER_MS);

    const candidates = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        deliveredAt: { gte: lower, lte: upper },
        /// Skip auto-marked orders — see header comment.
        NOT: { deliveredSource: 'auto' },
        /// Skip orders that already had a nudge sent. The marker
        /// is an OrderEvent row with type NOTE + payload.kind =
        /// 'review_nudge_sent' — see emit path below.
        events: {
          none: {
            type: 'NOTE',
            payload: { path: ['kind'], equals: 'review_nudge_sent' },
          },
        },
      },
      select: { id: true, userId: true, orderNumber: true },
      take: BATCH_LIMIT,
    });

    if (candidates.length === 0) {
      logger.info('reviews.nudge_cron.no_candidates');
      return;
    }

    let emitted = 0;
    for (const { id, userId, orderNumber } of candidates) {
      try {
        await eventBus.emit('order.review_nudge_due', {
          orderId: id,
          userId,
        });
        /// Write the idempotency marker AFTER successful emit so
        /// a thrown subscriber doesn't suppress retries on the
        /// next sweep. Subscribers themselves are best-effort.
        await prisma.orderEvent.create({
          data: {
            orderId: id,
            type: 'NOTE',
            payload: { kind: 'review_nudge_sent' } as object,
            isCustomerVisible: false,
          },
        });
        emitted++;
      } catch (err) {
        logger.error('reviews.nudge_cron.row_failed', {
          orderId: id,
          orderNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('reviews.nudge_cron.swept', {
      candidates: candidates.length,
      emitted,
    });
  } catch (err) {
    logger.error('reviews.nudge_cron.sweep_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startReviewNudgeCron(): void {
  setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('reviews.nudge_cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    windowLowerHours: NUDGE_LOWER_MS / (60 * 60 * 1000),
    windowUpperHours: NUDGE_UPPER_MS / (60 * 60 * 1000),
  });
}
