import { logger } from '@/infra/logger';
import { HttpError } from '@/middleware/error-handler';
import { getTrendingProductIds } from '@/modules/views/service';
import type {
  AlsoBoughtQuery,
  FrequentlyBoughtTogetherQuery,
  SimilarQuery,
  TrendingQuery,
  ViewedAlsoViewedQuery,
} from './schema';
import {
  coPurchase,
  getSeedProduct,
  getSeedProducts,
  insertImpression,
  recordImpressionClick,
  similarProducts,
  trendingNearYou,
  viewedAlsoViewed,
  type RecommendationRow,
} from './repository';

/**
 * Business logic for Recommendations & Personalization Phase 0 (see
 * `Afrizonemart_Recommendations_Personalization_Design_Spec.docx`,
 * ALGORITHM_SYSTEMS_TRACKER.md for the full roadmap).
 *
 * Pipeline (spec Section 5.1): context resolution → candidate
 * generation (content-score, trending, or co-purchase/co-view) →
 * business layer (hard deliverability filter, in-stock-only, seed
 * de-dup) → serve + log impression. Ranking is folded into candidate
 * generation's SQL scoring rather than a separate stage — there's no
 * learned ranker yet (Component 2 is a Phase 2+ concern once there's
 * enough click/conversion data to train on). Personalization and
 * everything else in Section 11's module table beyond Phase 0/1 is
 * deliberately not built here — see the tracker's open sub-checklist.
 *
 * Phase 1 additions (`alsoBought`, `frequentlyBoughtTogether`,
 * `viewedAlsoViewedModule`) fall back to the Phase 0 content-based
 * `similarProducts` retriever when co-purchase/co-view data is thin —
 * required by spec Section 3.1 ("every module degrades gracefully to
 * popularity/content-based when personalized data is thin"). Confirmed
 * necessary against real prod data: multi-item orders are still rare
 * this early, so co-purchase alone returns empty for most products
 * today.
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
  module: 'similar' | 'trending' | 'also-bought' | 'frequently-bought-together' | 'viewed-also-viewed';
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

/// "Customers also bought" (PDP) — Phase 1 co-purchase, single seed.
export async function alsoBought(
  query: AlsoBoughtQuery,
  ctx: { userId?: string },
): Promise<RecommendationResult> {
  const seed = await getSeedProduct(query.slug);
  if (!seed) throw HttpError.notFound('Product not found');

  let rows = await coPurchase([seed.id], [], query.limit, query.country);
  if (rows.length < query.limit) {
    const excludeIds = [seed.id, ...rows.map((r) => r.id)];
    const pad = await similarProducts(seed, query.limit - rows.length, query.country);
    rows = [...rows, ...pad.filter((p) => !excludeIds.includes(p.id))];
  }

  const impressionId = await logImpression({
    module: 'also-bought',
    surface: query.surface,
    seedProductId: seed.id,
    productIds: rows.map((r) => r.id),
    userId: ctx.userId,
    sessionId: query.sessionId,
    country: query.country,
  });

  return { module: 'also-bought', items: rows.map(serializeRow), impressionId };
}

/// "Frequently bought together" (cart/checkout) — Phase 1 co-purchase,
/// seeded by every product already in the cart so the module suggests
/// complements to the whole basket, not just the last item added.
export async function frequentlyBoughtTogether(
  query: FrequentlyBoughtTogetherQuery,
  ctx: { userId?: string },
): Promise<RecommendationResult> {
  const seeds = await getSeedProducts(query.slugs);
  const seedIds = seeds.map((s) => s.id);
  if (seedIds.length === 0) {
    return { module: 'frequently-bought-together', items: [], impressionId: null };
  }

  let rows = await coPurchase(seedIds, [], query.limit, query.country);
  if (rows.length < query.limit) {
    // Anchor the content-based pad on the first cart item — an
    // approximation (a real multi-item content query doesn't exist),
    // but a reasonable one: any single cart item's neighbourhood is a
    // better complement suggestion than an empty section.
    const excludeIds = [...seedIds, ...rows.map((r) => r.id)];
    const pad = await similarProducts(seeds[0], query.limit - rows.length, query.country);
    rows = [...rows, ...pad.filter((p) => !excludeIds.includes(p.id))];
  }

  const impressionId = await logImpression({
    module: 'frequently-bought-together',
    surface: query.surface,
    productIds: rows.map((r) => r.id),
    userId: ctx.userId,
    sessionId: query.sessionId,
    country: query.country,
  });

  return { module: 'frequently-bought-together', items: rows.map(serializeRow), impressionId };
}

/// "Viewed also viewed" (PDP) — Phase 1 co-view, distinct signal from
/// both content similarity (`similar`) and co-purchase (`alsoBought`).
export async function viewedAlsoViewedModule(
  query: ViewedAlsoViewedQuery,
  ctx: { userId?: string },
): Promise<RecommendationResult> {
  const seed = await getSeedProduct(query.slug);
  if (!seed) throw HttpError.notFound('Product not found');

  let rows = await viewedAlsoViewed(seed.id, query.limit, query.country);
  if (rows.length < query.limit) {
    const excludeIds = [seed.id, ...rows.map((r) => r.id)];
    const pad = await similarProducts(seed, query.limit - rows.length, query.country);
    rows = [...rows, ...pad.filter((p) => !excludeIds.includes(p.id))];
  }

  const impressionId = await logImpression({
    module: 'viewed-also-viewed',
    surface: query.surface,
    seedProductId: seed.id,
    productIds: rows.map((r) => r.id),
    userId: ctx.userId,
    sessionId: query.sessionId,
    country: query.country,
  });

  return { module: 'viewed-also-viewed', items: rows.map(serializeRow), impressionId };
}
