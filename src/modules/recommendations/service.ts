import { logger } from '@/infra/logger';
import { HttpError } from '@/middleware/error-handler';
import { getTrendingProductIds } from '@/modules/views/service';
import type { SimilarQuery, TrendingQuery } from './schema';
import {
  getSeedProduct,
  insertImpression,
  recordImpressionClick,
  similarProducts,
  trendingNearYou,
  type RecommendationRow,
} from './repository';

/**
 * Business logic for Recommendations & Personalization Phase 0 (see
 * `Afrizonemart_Recommendations_Personalization_Design_Spec.docx`,
 * ALGORITHM_SYSTEMS_TRACKER.md for the full roadmap).
 *
 * Pipeline (spec Section 5.1), Phase-0-scoped to two modules:
 *   context resolution → candidate generation (content-score or
 *   trending) → business layer (hard deliverability filter,
 *   in-stock-only, seed de-dup) → serve + log impression. Ranking is
 *   folded into candidate generation's SQL scoring rather than a
 *   separate stage — there's no learned ranker yet (Component 2 is a
 *   Phase 1+ concern once there's enough click/conversion data to
 *   train on). Co-purchase, personalization, and everything else in
 *   Section 11's module table beyond Phase 0 is deliberately not built
 *   here — see the tracker's open sub-checklist.
 */

const TRENDING_WINDOW_DAYS = 14;

function serializeRow(row: RecommendationRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    price: row.price,
    comparePrice: row.comparePrice,
    discountPercent: row.discountPercent,
    origin: row.origin,
    rating: row.rating,
    reviewCount: row.reviewCount,
    images: row.images,
    inStock: row.inStock,
    sellableCountries: row.sellableCountries,
    category: row.categoryId
      ? { id: row.categoryId, slug: row.categorySlug, name: row.categoryName }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RecommendationResult {
  module: 'similar' | 'trending';
  items: ReturnType<typeof serializeRow>[];
  /// Id of the RecommendationImpression row this call produced — the
  /// client passes it back on `POST /api/recommendations/click`.
  /// Null only if impression logging itself failed (never blocks
  /// serving the recommendations).
  impressionId: string | null;
}

async function logImpression(row: {
  module: string;
  surface: string;
  seedProductId?: string;
  productIds: string[];
  userId?: string;
  sessionId?: string;
  country?: string;
}): Promise<string | null> {
  try {
    return await insertImpression(row);
  } catch (error) {
    logger.error('recommendations.impression_log_failed', { error, module: row.module });
    return null;
  }
}

export async function similar(
  query: SimilarQuery,
  ctx: { userId?: string },
): Promise<RecommendationResult> {
  const seed = await getSeedProduct(query.slug);
  if (!seed) throw HttpError.notFound('Product not found');

  const rows = await similarProducts(seed, query.limit, query.country);

  const impressionId = await logImpression({
    module: 'similar',
    surface: query.surface,
    seedProductId: seed.id,
    productIds: rows.map((r) => r.id),
    userId: ctx.userId,
    sessionId: query.sessionId,
    country: query.country,
  });

  return { module: 'similar', items: rows.map(serializeRow), impressionId };
}

export async function trending(
  query: TrendingQuery,
  ctx: { userId?: string },
): Promise<RecommendationResult> {
  // Overfetch trending IDs the same way products/repository.ts does for
  // sort=trending — the deliverability filter drains some of them, so
  // asking for exactly `limit` IDs would under-fill after filtering.
  const trendingIds = await getTrendingProductIds(TRENDING_WINDOW_DAYS, query.limit + 25);
  const rows = await trendingNearYou(trendingIds, query.limit, query.country);

  const impressionId = await logImpression({
    module: 'trending',
    surface: query.surface,
    productIds: rows.map((r) => r.id),
    userId: ctx.userId,
    sessionId: query.sessionId,
    country: query.country,
  });

  return { module: 'trending', items: rows.map(serializeRow), impressionId };
}

export async function trackClick(impressionId: string, productId: string): Promise<void> {
  await recordImpressionClick(impressionId, productId);
}
