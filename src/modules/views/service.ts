import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/infra/logger';
import type { CreateViewBody } from './schema';

/**
 * Product view tracker — append-only log + read-side aggregations.
 *
 * Writes: `recordViewService` inserts one row per "meaningful" PDP
 * dwell with a soft dedup (per (sessionId|userId, productId)) so a
 * device that reloads the same page in quick succession doesn't
 * inflate trending counts.
 *
 * Reads:
 *   • `getTrendingProductIds` — top productIds by view count in the
 *     last N days (used by /api/products?sort=trending).
 *   • Cleanup is delegated to a cron in `cron.ts` (90-day retention).
 *
 * Lossy-but-cheap: failures (DB down, validation odd) are logged and
 * swallowed at the controller layer — a view that doesn't get logged
 * isn't worth surfacing as a 500 to the PDP. Trending is best-effort.
 */

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 min

export async function recordViewService(
  body: CreateViewBody,
  userId: string | null,
): Promise<{ logged: boolean }> {
  const product = await prisma.product.findUnique({
    where: { slug: body.productSlug },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound('Product not found');

  /// Soft dedup — skip the insert if this session OR this user has
  /// already logged a view for this product in the last 5 minutes.
  /// We try sessionId first (most specific), then userId. Anonymous +
  /// no sessionId requests just always log (the worst case is one
  /// extra row, which the 90-day cleanup wipes).
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  let recent: { id: string } | null = null;
  if (body.sessionId) {
    recent = await prisma.productView.findFirst({
      where: {
        productId: product.id,
        sessionId: body.sessionId,
        viewedAt: { gte: since },
      },
      select: { id: true },
    });
  } else if (userId) {
    recent = await prisma.productView.findFirst({
      where: {
        productId: product.id,
        userId,
        viewedAt: { gte: since },
      },
      select: { id: true },
    });
  }
  if (recent) return { logged: false };

  await prisma.productView.create({
    data: {
      productId: product.id,
      userId: userId ?? null,
      sessionId: body.sessionId ?? null,
    },
  });
  return { logged: true };
}

/// Top productIds by view count in the last `days`. Returns the IDs
/// in descending count order. Callers fetch the product rows
/// separately and restore the order via a Map.
///
/// Used by /api/products?sort=trending. Falls back to an empty list
/// if there are no views in the window — caller can pad with newest.
export async function getTrendingProductIds(
  days: number,
  limit: number,
): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const rows = await prisma.productView.groupBy({
      by: ['productId'],
      where: { viewedAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    return rows.map((r) => r.productId);
  } catch (err) {
    /// Trending is best-effort; if the aggregation fails, fall back
    /// to no trending IDs so the caller fills with newest.
    logger.warn('views.trending.failed', { error: String(err) });
    return [];
  }
}

/// Cron-callable cleanup. Returns the count of deleted rows so the
/// cron logs something useful.
export async function pruneOldViewsService(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const res = await prisma.productView.deleteMany({
    where: { viewedAt: { lt: cutoff } },
  });
  return res.count;
}
