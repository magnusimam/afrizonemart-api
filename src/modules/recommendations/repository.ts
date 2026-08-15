import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';

/**
 * Raw-SQL layer for the Recommendations module (Phase 0).
 *
 * Deliberate substitution, same call as Search Phase 0: the design
 * spec's Component 1 (Section 7) specifies a content-similarity
 * retriever built on shared embeddings + an OpenSearch k-NN index.
 * Neither exists yet — Search Phase 0 shipped on Postgres full-text
 * instead of embeddings (see ALGORITHM_SYSTEMS_TRACKER.md), so there
 * is no vector space to reuse. "Similar products" here is a
 * transparent weighted-scoring retriever instead (category, brand,
 * origin, price-band overlap + a quality tie-breaker) — exactly the
 * "keep a transparent weighted-scoring fallback ... as the lightweight
 * first-pass stage" the spec itself prescribes for cold conditions
 * (Section 8), just promoted to the *primary* Phase 0 method rather
 * than a fallback behind a model that doesn't exist yet. Revisit once
 * Search grows real embeddings (its own Phase 2).
 */

export interface RecommendationRow {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  price: number;
  comparePrice: number | null;
  discountPercent: number | null;
  origin: string | null;
  rating: number;
  reviewCount: number;
  images: string[];
  inStock: boolean;
  sellableCountries: string[];
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  createdAt: Date;
  score: number;
}

const SELECT_FIELDS = Prisma.sql`
  p.id, p.slug, p.name, p.brand, p.price, p."comparePrice", p."discountPercent",
  p.origin, p.rating, p."reviewCount", p.images, p."inStock", p."sellableCountries",
  p."categoryId", c.slug AS "categorySlug", c.name AS "categoryName", p."createdAt"
`;

const FROM_JOIN = Prisma.sql`
  FROM "Product" p
  LEFT JOIN "Category" c ON c.id = p."categoryId"
`;

/// Deliverability is a hard filter here (spec Section 9 — "recommending
/// the undeliverable is worse than recommending nothing"), not the
/// soft opt-in `shipsToMe` toggle Search uses for browsing. Only
/// applied when the caller actually knows the viewer's country;
/// unknown location degrades to unfiltered rather than guessing wrong.
function deliverabilityFilter(country: string | undefined): Prisma.Sql {
  if (!country) return Prisma.empty;
  const c = country.toUpperCase();
  return Prisma.sql`AND (cardinality(p."sellableCountries") = 0 OR ${c} = ANY(p."sellableCountries") OR p."origin" = ${c})`;
}

export interface SeedProduct {
  id: string;
  categoryId: string | null;
  brand: string | null;
  origin: string | null;
  price: number;
}

/**
 * Content-based "similar products" — weighted score:
 *   +40 same category, +25 same brand, +15 same origin,
 *   +10 price within ±50% of the seed, + rating*2 as a quality
 * tie-breaker so near-ties favour the better-reviewed item. Always
 * returns up to `limit` rows (ordered by score, no hard cutoff) so
 * the module degrades gracefully rather than going empty when the
 * seed shares little with the rest of the catalogue — same
 * graceful-degradation posture as Search's trigram fallback.
 */
export async function similarProducts(
  seed: SeedProduct,
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  const deliverability = deliverabilityFilter(country);
  const rows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS},
      (
        (CASE WHEN p."categoryId" IS NOT NULL AND p."categoryId" = ${seed.categoryId} THEN 40 ELSE 0 END) +
        (CASE WHEN p."brand" IS NOT NULL AND p."brand" = ${seed.brand} THEN 25 ELSE 0 END) +
        (CASE WHEN p."origin" IS NOT NULL AND p."origin" = ${seed.origin} THEN 15 ELSE 0 END) +
        (CASE WHEN p."price" BETWEEN ${seed.price} * 0.5 AND ${seed.price} * 1.5 THEN 10 ELSE 0 END) +
        (p."rating" * 2)
      ) AS score
    ${FROM_JOIN}
    WHERE p.id != ${seed.id}
      AND p."inStock" = true
      ${deliverability}
    ORDER BY score DESC, p."reviewCount" DESC, p."createdAt" DESC
    LIMIT ${limit}
  `);
  return rows;
}

export async function getSeedProduct(slug: string): Promise<SeedProduct | null> {
  const row = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, categoryId: true, brand: true, origin: true, price: true },
  });
  return row;
}

/**
 * "Trending near you" — wraps the existing view-count trending
 * aggregation (`views/service.ts#getTrendingProductIds`, already
 * powering `/api/products?sort=trending`) but adds the hard
 * deliverability filter that endpoint doesn't apply, plus a
 * popularity-based pad (rating × log(reviewCount)) so the module
 * still fills out when trending has too few deliverable hits — same
 * pad-with-something-reasonable pattern `products/repository.ts` uses
 * for `sort=trending`, just padding with quality/popularity instead
 * of newest since this module's whole point is "what's hot", not
 * "what's new".
 */
export async function trendingNearYou(
  trendingIds: string[],
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  const deliverability = deliverabilityFilter(country);

  const trendingRows =
    trendingIds.length > 0
      ? await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
          SELECT ${SELECT_FIELDS}, 0 AS score
          ${FROM_JOIN}
          WHERE p.id IN (${Prisma.join(trendingIds)})
            AND p."inStock" = true
            ${deliverability}
        `)
      : [];
  const byId = new Map(trendingRows.map((r) => [r.id, r]));
  const ordered = trendingIds.map((id) => byId.get(id)).filter((r): r is RecommendationRow => Boolean(r));

  if (ordered.length >= limit) return ordered.slice(0, limit);

  const excludeIds = ordered.map((r) => r.id);
  const padNeeded = limit - ordered.length;
  const padRows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, (p."rating" * ln(p."reviewCount" + 2)) AS score
    ${FROM_JOIN}
    WHERE p."inStock" = true
      ${excludeIds.length > 0 ? Prisma.sql`AND p.id NOT IN (${Prisma.join(excludeIds)})` : Prisma.empty}
      ${deliverability}
    ORDER BY score DESC, p."createdAt" DESC
    LIMIT ${padNeeded}
  `);

  return [...ordered, ...padRows];
}

export async function insertImpression(row: {
  module: string;
  surface: string;
  seedProductId?: string;
  productIds: string[];
  userId?: string;
  sessionId?: string;
  country?: string;
}): Promise<string> {
  const created = await prisma.recommendationImpression.create({
    data: {
      module: row.module,
      surface: row.surface,
      seedProductId: row.seedProductId ?? null,
      productIds: row.productIds,
      userId: row.userId ?? null,
      sessionId: row.sessionId ?? null,
      country: row.country ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export async function recordImpressionClick(impressionId: string, productId: string): Promise<boolean> {
  const result = await prisma.recommendationImpression.updateMany({
    where: { id: impressionId, clickedProductId: null },
    data: { clickedProductId: productId },
  });
  return result.count > 0;
}
