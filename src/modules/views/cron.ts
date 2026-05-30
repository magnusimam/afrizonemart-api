import { logger } from '@/infra/logger';
import { pruneOldViewsService } from './service';

/**
 * Daily cleanup cron for ProductView rows.
 *
 * Retention is 90 days because trending only reads the last 7 and
 * "recently viewed" only the last 30 — anything older is dead weight.
 *
 * Mirrors the loyalty / payment cron patterns: `setTimeout` for the
 * first run (gives the API server time to fully boot), then
 * `setInterval` on a daily cadence. Failures are logged, never thrown.
 */

const RETENTION_DAYS = 90;
const STARTUP_DELAY_MS = 60_000; // 60s after boot
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const deleted = await pruneOldViewsService(RETENTION_DAYS);
    if (deleted > 0) {
      logger.info('views.cron.pruned', { deleted, retentionDays: RETENTION_DAYS });
    }
  } catch (err) {
    logger.warn('views.cron.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startViewMaintenanceCron(): void {
  setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('views.cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
    retentionDays: RETENTION_DAYS,
  });
}
