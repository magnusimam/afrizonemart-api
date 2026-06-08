import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { computeUserWrap } from './aggregation';

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
