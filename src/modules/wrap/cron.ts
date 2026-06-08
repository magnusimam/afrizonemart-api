import { logger } from '@/infra/logger';
import { publishWrapsForYear, runDailyWrapSweep } from './service';

/**
 * Two crons for the annual Afrizonemart Wrap:
 *
 *   1. **Daily incremental** — recomputes snapshots for users
 *      who placed an order in the last 36h OR who already have
 *      a snapshot this year. By Dec 1, every eligible user has
 *      an up-to-date snapshot — no giant year-end batch.
 *      Runs at 03:30 GMT to land after the 03:00 loyalty cron.
 *
 *   2. **Annual publish** — on Dec 1 at 09:00 GMT (lunchtime
 *      Lagos / morning London / evening Sydney — covers diaspora
 *      time zones), flips publishedAt on every snapshot.
 *      Customer endpoint flips from "coming soon" to "live."
 *
 * Both are tolerant of being run multiple times in a day — the
 * underlying service functions are idempotent.
 *
 * See WRAP_TRACKER.md §4.3 for the design.
 */

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const SWEEP_STARTUP_DELAY_MS = 60 * 1000; // 60s after boot

let sweepRunning = false;

async function runSweep(): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const year = new Date().getUTCFullYear();
    await runDailyWrapSweep(year);
  } catch (err) {
    logger.error('wrap.sweep.unexpected', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweepRunning = false;
  }
}

export function startWrapAggregationCron(): void {
  setTimeout(() => void runSweep(), SWEEP_STARTUP_DELAY_MS);
  setInterval(() => void runSweep(), SWEEP_INTERVAL_MS);
  logger.info('wrap.aggregation_cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    startupDelayMs: SWEEP_STARTUP_DELAY_MS,
  });
}

/**
 * Annual publish cron — runs once a day, no-ops unless today is
 * Dec 1 AND it's between 09:00 and 10:00 GMT. Keeps the logic
 * simple: cheap to run, only fires once per year.
 */
const PUBLISH_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

let publishRunning = false;

async function checkAndPublish(): Promise<void> {
  if (publishRunning) return;
  const now = new Date();
  const isDecemberFirst =
    now.getUTCMonth() === 11 && now.getUTCDate() === 1;
  const isWindow =
    now.getUTCHours() === 9; // 09:00-09:59 GMT
  if (!isDecemberFirst || !isWindow) return;
  publishRunning = true;
  try {
    const year = now.getUTCFullYear();
    const count = await publishWrapsForYear(year);
    logger.info('wrap.publish_cron.fired', { year, count });
  } catch (err) {
    logger.error('wrap.publish_cron.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    publishRunning = false;
  }
}

export function startWrapPublishCron(): void {
  setInterval(() => void checkAndPublish(), PUBLISH_CHECK_INTERVAL_MS);
  logger.info('wrap.publish_cron.started', {
    intervalMs: PUBLISH_CHECK_INTERVAL_MS,
  });
}
