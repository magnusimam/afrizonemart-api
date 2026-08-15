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

/// Orders in these statuses never represent a real completed
/// transaction — excluded from co-purchase mining so an abandoned
/// PENDING_PAYMENT cart or a fully CANCELLED order can't inflate
/// "bought together" signal for items nobody actually paid for.
/// REFUNDED is intentionally included: the purchase pattern that led
/// to the order still happened, refund or not.
const COPURCHASE_EXCLUDED_STATUSES = Prisma.sql`'PENDING_PAYMENT', 'CANCELLED'`;

/// Co-view mining is windowed to the same 90 days `views/cron.ts`
/// already retains `ProductView` rows for — recent co-view behaviour
/// is what matters, and it keeps the self-join bounded without
/// needing a separate precomputed table yet.
const COVIEW_WINDOW_DAYS = 90;

/**
 * Phase 1 — co-purchase retriever, shared by both "Customers also
 * bought" (single seed, PDP) and "Frequently bought together" (multi-
 * seed, cart) per spec Section 7/11: same underlying signal
 * (item-to-item co-occurrence in `OrderItem`, self-joined on
 * `orderId`), just seeded differently. Ranked by the number of
 * distinct orders the pair appeared in together.
 */
export async function coPurchase(
  seedProductIds: string[],
  excludeIds: string[],
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  if (seedProductIds.length === 0) return [];
  const deliverability = deliverabilityFilter(country);
  const excluded = Array.from(new Set([...seedProductIds, ...excludeIds]));

  const pairs = await prisma.$queryRaw<Array<{ productId: string; coCount: bigint }>>(Prisma.sql`
    SELECT oi2."productId" AS "productId", COUNT(DISTINCT oi1."orderId")::bigint AS "coCount"
    FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi2."orderId" = oi1."orderId" AND oi2."productId" != oi1."productId"
    JOIN "Order" o ON o.id = oi1."orderId"
    WHERE oi1."productId" IN (${Prisma.join(seedProductIds)})
      AND oi2."productId" NOT IN (${Prisma.join(excluded)})
      AND o.status NOT IN (${COPURCHASE_EXCLUDED_STATUSES})
    GROUP BY oi2."productId"
    ORDER BY "coCount" DESC
    LIMIT ${limit}
  `);
  if (pairs.length === 0) return [];

  const ids = pairs.map((p) => p.productId);
  const rows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, 0 AS score
    ${FROM_JOIN}
    WHERE p.id IN (${Prisma.join(ids)})
      AND p."inStock" = true
      ${deliverability}
  `);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const coCountById = new Map(pairs.map((p) => [p.productId, Number(p.coCount)]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is RecommendationRow => Boolean(r))
    .map((r) => ({ ...r, score: coCountById.get(r.id) ?? 0 }));
}

/**
 * Phase 1 — "Viewed also viewed" (spec Section 11): co-view retriever,
 * distinct from `coPurchase` — pairs of products viewed within the
 * same anonymous session (or by the same signed-in user when there's
 * no session id) inside the last `COVIEW_WINDOW_DAYS` days.
 */
export async function viewedAlsoViewed(
  seedProductId: string,
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  const deliverability = deliverabilityFilter(country);
  const since = new Date(Date.now() - COVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pairs = await prisma.$queryRaw<Array<{ productId: string; coCount: bigint }>>(Prisma.sql`
    SELECT pv2."productId" AS "productId", COUNT(DISTINCT COALESCE(pv1."sessionId", pv1."userId"))::bigint AS "coCount"
    FROM "ProductView" pv1
    JOIN "ProductView" pv2
      ON pv2."productId" != pv1."productId"
      AND pv2."viewedAt" >= ${since}
      AND (
        (pv1."sessionId" IS NOT NULL AND pv1."sessionId" = pv2."sessionId")
        OR (pv1."sessionId" IS NULL AND pv1."userId" IS NOT NULL AND pv1."userId" = pv2."userId")
      )
    WHERE pv1."productId" = ${seedProductId}
      AND pv1."viewedAt" >= ${since}
    GROUP BY pv2."productId"
    ORDER BY "coCount" DESC
    LIMIT ${limit}
  `);
  if (pairs.length === 0) return [];

  const ids = pairs.map((p) => p.productId);
  const rows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, 0 AS score
    ${FROM_JOIN}
    WHERE p.id IN (${Prisma.join(ids)})
      AND p.id != ${seedProductId}
      AND p."inStock" = true
      ${deliverability}
  `);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const coCountById = new Map(pairs.map((p) => [p.productId, Number(p.coCount)]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is RecommendationRow => Boolean(r))
    .map((r) => ({ ...r, score: coCountById.get(r.id) ?? 0 }));
}

/// Purchases outrank views 3:1 — a completed order is a much stronger
/// affinity signal than a dwell-time view. All-time (purchases aren't
/// pruned); views are naturally bounded to the 90-day retention window
/// `views/cron.ts` already enforces.
const PURCHASE_AFFINITY_WEIGHT = 3;
const VIEW_AFFINITY_WEIGHT = 1;
const TOP_AFFINITY_N = 5;

export interface UserAffinities {
  categoryIds: string[];
  brands: string[];
  origins: string[];
}

const EMPTY_AFFINITIES: UserAffinities = { categoryIds: [], brands: [], origins: [] };

/**
 * Phase 2 — user profile, computed live from order + view history
 * (spec Section 12: category/brand/origin affinity). Same "live query,
 * not a precomputed profile table" substitution Phase 1 made for
 * co-visitation — deferred until real user history volume justifies
 * batch precomputation.
 *
 * Guests (no `userId`) get `EMPTY_AFFINITIES` — `forYou`'s scoring
 * query treats an empty affinity array as a no-op (`= ANY('{}')` never
 * matches), so it naturally falls through to pure popularity ranking
 * without a separate code path. That IS the cold-start degradation
 * spec Section 10.2 asks for, not a special case.
 */
export async function getUserAffinities(userId: string | undefined): Promise<UserAffinities> {
  if (!userId) return EMPTY_AFFINITIES;

  const [categoryRows, brandRows, originRows] = await Promise.all([
    prisma.$queryRaw<Array<{ key: string; score: number }>>(Prisma.sql`
      SELECT key, SUM(weight)::float AS score FROM (
        SELECT p."categoryId" AS key, COUNT(*) * ${PURCHASE_AFFINITY_WEIGHT} AS weight
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."userId" = ${userId} AND o.status NOT IN (${COPURCHASE_EXCLUDED_STATUSES}) AND p."categoryId" IS NOT NULL
        GROUP BY p."categoryId"
        UNION ALL
        SELECT p."categoryId" AS key, COUNT(*) * ${VIEW_AFFINITY_WEIGHT} AS weight
        FROM "ProductView" pv
        JOIN "Product" p ON p.id = pv."productId"
        WHERE pv."userId" = ${userId} AND p."categoryId" IS NOT NULL
        GROUP BY p."categoryId"
      ) t
      GROUP BY key ORDER BY score DESC LIMIT ${TOP_AFFINITY_N}
    `),
    prisma.$queryRaw<Array<{ key: string; score: number }>>(Prisma.sql`
      SELECT key, SUM(weight)::float AS score FROM (
        SELECT p."brand" AS key, COUNT(*) * ${PURCHASE_AFFINITY_WEIGHT} AS weight
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."userId" = ${userId} AND o.status NOT IN (${COPURCHASE_EXCLUDED_STATUSES}) AND p."brand" IS NOT NULL
        GROUP BY p."brand"
        UNION ALL
        SELECT p."brand" AS key, COUNT(*) * ${VIEW_AFFINITY_WEIGHT} AS weight
        FROM "ProductView" pv
        JOIN "Product" p ON p.id = pv."productId"
        WHERE pv."userId" = ${userId} AND p."brand" IS NOT NULL
        GROUP BY p."brand"
      ) t
      GROUP BY key ORDER BY score DESC LIMIT ${TOP_AFFINITY_N}
    `),
    prisma.$queryRaw<Array<{ key: string; score: number }>>(Prisma.sql`
      SELECT key, SUM(weight)::float AS score FROM (
        SELECT p."origin" AS key, COUNT(*) * ${PURCHASE_AFFINITY_WEIGHT} AS weight
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."userId" = ${userId} AND o.status NOT IN (${COPURCHASE_EXCLUDED_STATUSES}) AND p."origin" IS NOT NULL
        GROUP BY p."origin"
        UNION ALL
        SELECT p."origin" AS key, COUNT(*) * ${VIEW_AFFINITY_WEIGHT} AS weight
        FROM "ProductView" pv
        JOIN "Product" p ON p.id = pv."productId"
        WHERE pv."userId" = ${userId} AND p."origin" IS NOT NULL
        GROUP BY p."origin"
      ) t
      GROUP BY key ORDER BY score DESC LIMIT ${TOP_AFFINITY_N}
    `),
  ]);

  return {
    categoryIds: categoryRows.map((r) => r.key),
    brands: brandRows.map((r) => r.key),
    origins: originRows.map((r) => r.key),
  };
}

/// Products a user has already bought (any non-excluded-status order)
/// — Phase 2 "For You" excludes them outright rather than suggesting a
/// repeat purchase; that's a distinct, purpose-built job for the
/// Phase 3 reorder/replenishment recommender, not this module.
export async function getPurchasedProductIds(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.$queryRaw<Array<{ productId: string }>>(Prisma.sql`
    SELECT DISTINCT oi."productId"
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."userId" = ${userId} AND o.status NOT IN (${COPURCHASE_EXCLUDED_STATUSES})
  `);
  return rows.map((r) => r.productId);
}

/**
 * Phase 2 — "For You" candidate generation + ranking in one query:
 * affinity match (category/brand/origin) + a popularity/quality term,
 * so a brand-new user with empty affinities (guest or no history yet)
 * gets pure popularity ranking — the exact cold-start degradation
 * spec Section 10.2 asks for, no separate branch needed.
 */
export async function forYou(
  affinities: UserAffinities,
  excludeIds: string[],
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  const deliverability = deliverabilityFilter(country);
  const exclude = excludeIds.length > 0 ? Prisma.sql`AND p.id NOT IN (${Prisma.join(excludeIds)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS},
      (
        (CASE WHEN p."categoryId" IS NOT NULL AND p."categoryId" = ANY(${affinities.categoryIds}::text[]) THEN 30 ELSE 0 END) +
        (CASE WHEN p."brand" IS NOT NULL AND p."brand" = ANY(${affinities.brands}::text[]) THEN 20 ELSE 0 END) +
        (CASE WHEN p."origin" IS NOT NULL AND p."origin" = ANY(${affinities.origins}::text[]) THEN 15 ELSE 0 END) +
        (p."rating" * ln(p."reviewCount" + 2))
      ) AS score
    ${FROM_JOIN}
    WHERE p."inStock" = true
      ${exclude}
      ${deliverability}
    ORDER BY score DESC, p."createdAt" DESC
    LIMIT ${limit}
  `);
  return rows;
}

/**
 * Phase 2 — "Recently viewed / continue" (spec Section 11: Home/nav
 * surface, pure user history — no ranking beyond recency). Distinct
 * product ids only (a product viewed 5 times shows once, most-recent
 * position), most recent first.
 */
export async function recentlyViewed(
  userId: string | undefined,
  sessionId: string | undefined,
  limit: number,
  country: string | undefined,
): Promise<RecommendationRow[]> {
  if (!userId && !sessionId) return [];
  const deliverability = deliverabilityFilter(country);
  const identity = userId
    ? Prisma.sql`pv."userId" = ${userId}`
    : Prisma.sql`pv."sessionId" = ${sessionId}`;

  const recent = await prisma.$queryRaw<Array<{ productId: string; lastViewedAt: Date }>>(Prisma.sql`
    SELECT pv."productId", MAX(pv."viewedAt") AS "lastViewedAt"
    FROM "ProductView" pv
    WHERE ${identity}
    GROUP BY pv."productId"
    ORDER BY "lastViewedAt" DESC
    LIMIT ${limit}
  `);
  if (recent.length === 0) return [];

  const ids = recent.map((r) => r.productId);
  const rows = await prisma.$queryRaw<RecommendationRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, 0 AS score
    ${FROM_JOIN}
    WHERE p.id IN (${Prisma.join(ids)})
      AND p."inStock" = true
      ${deliverability}
  `);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is RecommendationRow => Boolean(r));
}

export async function getSeedProducts(slugs: string[]): Promise<SeedProduct[]> {
  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, categoryId: true, brand: true, origin: true, price: true },
  });
  return rows;
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
