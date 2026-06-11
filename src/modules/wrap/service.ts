import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import {
  computeUserWrap,
  MIN_ORDERS,
  QUALIFYING_STATUSES,
} from './aggregation';

/**
 * Upsert one user's snapshot for the current year. Idempotent.
 * No-op when the user is opted out OR doesn't meet the minimum
 * order threshold (aggregation returns null).
 */
export async function upsertUserWrap(
  userId: string,
  year: number,
): Promise<{ skipped: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrapOptOut: true, deletedAt: true },
  });
  if (!user) return { skipped: true, reason: 'user_not_found' };
  if (user.deletedAt) return { skipped: true, reason: 'user_deleted' };
  if (user.wrapOptOut) return { skipped: true, reason: 'opted_out' };

  const stats = await computeUserWrap(userId, year);
  if (!stats) return { skipped: true, reason: 'below_min_orders' };

  await prisma.wrappedSnapshot.upsert({
    where: { userId_year: { userId, year } },
    create: {
      userId,
      year,
      stats: stats as unknown as object,
    },
    update: {
      stats: stats as unknown as object,
      computedAt: new Date(),
    },
  });
  return { skipped: false };
}

/**
 * List users who placed a qualifying order in the last `windowHours`
 * hours, OR who already have a snapshot this year (so we keep
 * recomputing them as their stats evolve through the year).
 *
 * Drives the daily incremental sweep.
 */
export async function listUsersDueForWrapRecompute(
  year: number,
  windowHours = 36,
): Promise<string[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const recent = await prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ['PAID', 'FULFILLING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const existing = await prisma.wrappedSnapshot.findMany({
    where: { year },
    select: { userId: true },
  });
  const ids = new Set<string>();
  for (const r of recent) ids.add(r.userId);
  for (const e of existing) ids.add(e.userId);
  return [...ids];
}

/**
 * Sweep: upsert snapshots for every due user. Logs counts so
 * the cron has signal.
 */
export async function runDailyWrapSweep(year: number): Promise<void> {
  const userIds = await listUsersDueForWrapRecompute(year);
  let upserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const r = await upsertUserWrap(userId, year);
      if (r.skipped) skipped++;
      else upserted++;
    } catch (err) {
      failed++;
      logger.error('wrap.sweep.row_failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('wrap.sweep.complete', {
    year,
    candidates: userIds.length,
    upserted,
    skipped,
    failed,
  });
}

/**
 * Every user with >= MIN_ORDERS qualifying orders this year — i.e.
 * everyone who SHOULD have a snapshot, regardless of recent activity.
 * The incremental sweep only sees the last 36h + existing snapshots;
 * this is the full eligibility set, used by the backfill.
 */
export async function listAllEligibleUserIds(year: number): Promise<string[]> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const grouped = await prisma.order.groupBy({
    by: ['userId'],
    where: {
      status: { in: [...QUALIFYING_STATUSES] },
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    _count: { _all: true },
  });
  return grouped
    .filter((g) => g._count._all >= MIN_ORDERS)
    .map((g) => g.userId);
}

/**
 * Full backfill — upserts a snapshot for EVERY eligible user, not
 * just the recently-active ones. The incremental daily sweep can miss
 * a user whose order landed during an API outage longer than its 36h
 * window (e.g. the 11-day Railway gap in 2026-06). This closes that:
 * run it nightly in November and/or right before the Dec 1 publish so
 * no eligible customer is left without a wrap. Idempotent.
 */
export async function runFullWrapBackfill(
  year: number,
): Promise<{ eligible: number; upserted: number; skipped: number; failed: number }> {
  const userIds = await listAllEligibleUserIds(year);
  let upserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const r = await upsertUserWrap(userId, year);
      if (r.skipped) skipped++;
      else upserted++;
    } catch (err) {
      failed++;
      logger.error('wrap.backfill.row_failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = { eligible: userIds.length, upserted, skipped, failed };
  logger.info('wrap.backfill.complete', { year, ...result });
  return result;
}

/**
 * Annual publish — flips `publishedAt` for every snapshot in the
 * year. Idempotent (only updates rows where publishedAt IS NULL
 * AND visible = true).
 *
 * Triggered by the Dec 1 publish cron OR manually via admin
 * endpoint (for QA / a re-run if the cron fails).
 */
export async function publishWrapsForYear(year: number): Promise<number> {
  const now = new Date();
  const res = await prisma.wrappedSnapshot.updateMany({
    where: {
      year,
      publishedAt: null,
      visible: true,
    },
    data: { publishedAt: now },
  });
  logger.info('wrap.publish.done', { year, published: res.count, at: now });
  return res.count;
}
