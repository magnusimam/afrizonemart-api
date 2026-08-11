import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import type { SearchQuery } from './schema';

/**
 * Raw-SQL layer for the Search module.
 *
 * Postgres full-text (`Product.searchVector`, a generated tsvector column —
 * see migration `20260811120000_search_phase0`) and trigram similarity
 * aren't expressible through Prisma's query builder, so every query here
 * goes through `$queryRaw` with `Prisma.sql`/`Prisma.join` template
 * fragments — fully parameterized, no string-concatenated user input.
 *
 * This is Phase 0 of the Search & Discovery design spec: field-weighted
 * BM25-equivalent lexical ranking (`ts_rank_cd`) with a trigram fallback
 * for zero-result recovery. Phase 2 swaps/augments this with semantic
 * (vector) retrieval once an embedding service exists — see
 * ALGORITHM_SYSTEMS_TRACKER.md.
 */

export interface SearchRow {
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
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  createdAt: Date;
  rank: number;
}

/// Structured (non-text) filters shared by both the primary lexical
/// query and the trigram fallback — everything the storefront's shop
/// filters already express (category, origin, price, rating, stock,
/// sale, deliverability), so search results respect the same
/// commerce rules as browsing.
function buildStructuredFilters(query: SearchQuery, categoryIds: string[] | null): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (categoryIds !== null) {
    if (categoryIds.length === 0) {
      // Requested category slug didn't resolve to anything real —
      // return zero rows rather than silently ignoring the filter.
      conditions.push(Prisma.sql`FALSE`);
    } else {
      conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds)})`);
    }
  }
  if (query.origin && query.origin.length > 0) {
    conditions.push(Prisma.sql`p."origin" IN (${Prisma.join(query.origin)})`);
  }
  if (query.inStock !== undefined) {
    conditions.push(Prisma.sql`p."inStock" = ${query.inStock}`);
  }
  if (query.onSale === true) {
    conditions.push(Prisma.sql`p."comparePrice" IS NOT NULL`);
  }
  if (query.onSale === false) {
    conditions.push(Prisma.sql`p."comparePrice" IS NULL`);
  }
  if (query.minPrice !== undefined) {
    conditions.push(Prisma.sql`p."price" >= ${query.minPrice}`);
  }
  if (query.maxPrice !== undefined) {
    conditions.push(Prisma.sql`p."price" <= ${query.maxPrice}`);
  }
  if (query.minRating !== undefined && query.minRating > 0) {
    conditions.push(Prisma.sql`p."rating" >= ${query.minRating}`);
  }
  // Deliverability — business re-ranking Section 9 treats this as a hard
  // filter, not a soft demotion: an undeliverable result is a broken
  // promise, not a lower-quality one.
  if (query.shipsToMe === true && query.country) {
    const c = query.country.toUpperCase();
    conditions.push(
      Prisma.sql`(cardinality(p."sellableCountries") = 0 OR ${c} = ANY(p."sellableCountries") OR p."origin" = ${c})`,
    );
  }

  return conditions;
}

const SELECT_FIELDS = Prisma.sql`
  p.id, p.slug, p.name, p.brand, p.price, p."comparePrice", p."discountPercent",
  p.origin, p.rating, p."reviewCount", p.images, p."inStock", p."categoryId",
  c.slug AS "categorySlug", c.name AS "categoryName", p."createdAt"
`;

const FROM_JOIN = Prisma.sql`
  FROM "Product" p
  LEFT JOIN "Category" c ON c.id = p."categoryId"
`;

/**
 * Primary retrieval: field-weighted lexical match via the generated
 * tsvector column, ranked with `ts_rank_cd` (L1 — cheap text + quality
 * priors, per spec Section 8.1). Falls through to trigram similarity
 * (below) when this returns nothing — most search failures are typos,
 * not missing products.
 */
export async function lexicalSearch(
  query: SearchQuery,
  normalizedQuery: string,
  categoryIds: string[] | null,
  limit: number,
  offset: number,
): Promise<SearchRow[]> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;
  const orderBy = orderByClause(query.sort, true);

  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, ts_rank_cd(p."searchVector", query) AS rank
    ${FROM_JOIN}, plainto_tsquery('simple', ${normalizedQuery}) query
    WHERE p."searchVector" @@ query
    ${whereExtra}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows;
}

export async function lexicalSearchCount(
  query: SearchQuery,
  normalizedQuery: string,
  categoryIds: string[] | null,
): Promise<number> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    ${FROM_JOIN}, plainto_tsquery('simple', ${normalizedQuery}) query
    WHERE p."searchVector" @@ query
    ${whereExtra}
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Zero-result recovery (spec Section 3.1 / 6.1): trigram similarity
 * against `name`, so "shea buttr" still finds "shea butter". Only
 * invoked when `lexicalSearch` returns nothing for page 1 — it's a
 * fallback, not a blend, to keep ranking behaviour predictable.
 */
export async function trigramFallbackSearch(
  query: SearchQuery,
  rawQuery: string,
  categoryIds: string[] | null,
  limit: number,
  offset: number,
): Promise<SearchRow[]> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;
  const orderBy = orderByClause(query.sort, false);

  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, similarity(p."name", ${rawQuery}) AS rank
    ${FROM_JOIN}
    WHERE similarity(p."name", ${rawQuery}) > 0.2
    ${whereExtra}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows;
}

export async function trigramFallbackCount(
  query: SearchQuery,
  rawQuery: string,
  categoryIds: string[] | null,
): Promise<number> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    ${FROM_JOIN}
    WHERE similarity(p."name", ${rawQuery}) > 0.2
    ${whereExtra}
  `);
  return Number(rows[0]?.count ?? 0);
}

/// `useTextRank` picks whether "relevance" sort means `rank DESC`
/// (lexical) or is meaningless (trigram fallback still orders by its
/// own similarity score, aliased to `rank` in both queries — so this
/// only changes NON-relevance sort tie-breaking, never the column name).
function orderByClause(sort: SearchQuery['sort'], useTextRank: boolean): Prisma.Sql {
  switch (sort) {
    case 'price-asc':
      return Prisma.sql`p."price" ASC, rank DESC`;
    case 'price-desc':
      return Prisma.sql`p."price" DESC, rank DESC`;
    case 'rating':
      return Prisma.sql`p."rating" DESC, p."reviewCount" DESC, rank DESC`;
    case 'newest':
      return Prisma.sql`p."createdAt" DESC, rank DESC`;
    case 'relevance':
    default:
      return useTextRank
        ? Prisma.sql`rank DESC, p."rating" DESC, p."reviewCount" DESC, p."createdAt" DESC`
        : Prisma.sql`rank DESC, p."rating" DESC, p."createdAt" DESC`;
  }
}

export interface QuerySuggestionRow {
  normalizedQuery: string;
  frequency: bigint;
}

/// Autocomplete — query completions mined from past successful
/// searches (spec Section 12). `resultCount > 0` keeps dead-end
/// queries out of suggestions.
export async function suggestQueries(prefix: string, limit: number): Promise<QuerySuggestionRow[]> {
  return prisma.$queryRaw<QuerySuggestionRow[]>(Prisma.sql`
    SELECT "normalizedQuery", COUNT(*)::bigint AS frequency
    FROM "SearchQueryLog"
    WHERE "normalizedQuery" ILIKE ${prefix + '%'} AND "resultCount" > 0
    GROUP BY "normalizedQuery"
    ORDER BY frequency DESC
    LIMIT ${limit}
  `);
}

export interface ProductSuggestionRow {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  price: number;
}

/// Autocomplete — direct product/category jumps (spec Section 12).
/// Prefix-first via the trigram index, in-stock only (no point
/// suggesting a dead end).
export async function suggestProducts(prefix: string, limit: number): Promise<ProductSuggestionRow[]> {
  return prisma.$queryRaw<ProductSuggestionRow[]>(Prisma.sql`
    SELECT
      p.id, p.slug, p.name, p.price,
      CASE WHEN array_length(p.images, 1) IS NULL THEN NULL ELSE p.images[1] END AS image
    FROM "Product" p
    WHERE p."inStock" = true
      AND (p.name ILIKE ${prefix + '%'} OR similarity(p.name, ${prefix}) > 0.3)
    ORDER BY (p.name ILIKE ${prefix + '%'}) DESC, similarity(p.name, ${prefix}) DESC, p.rating DESC
    LIMIT ${limit}
  `);
}

export async function insertSearchQueryLog(row: {
  rawQuery: string;
  normalizedQuery: string;
  resultCount: number;
  userId?: string;
  sessionId?: string;
  country?: string;
}): Promise<string> {
  const created = await prisma.searchQueryLog.create({
    data: {
      rawQuery: row.rawQuery,
      normalizedQuery: row.normalizedQuery,
      resultCount: row.resultCount,
      userId: row.userId ?? null,
      sessionId: row.sessionId ?? null,
      country: row.country ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export async function recordSearchClick(queryLogId: string, productId: string): Promise<boolean> {
  const result = await prisma.searchQueryLog.updateMany({
    where: { id: queryLogId, clickedProductId: null },
    data: { clickedProductId: productId },
  });
  return result.count > 0;
}
