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
  sellableCountries: string[];
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  createdAt: Date;
  rank: number;
}

/// Filter dimension names, used by facet counting (below) to exclude a
/// dimension from its own count query — e.g. the "In Stock" facet
/// count should reflect every OTHER active filter but not `inStock`
/// itself, or checking the box would just show the count of what's
/// already showing.
type FilterDimension = 'category' | 'origin' | 'inStock' | 'onSale' | 'price' | 'minRating' | 'shipsToMe';

/// Structured (non-text) filters shared by both the primary lexical
/// query and the trigram fallback — everything the storefront's shop
/// filters already express (category, origin, price, rating, stock,
/// sale, deliverability), so search results respect the same
/// commerce rules as browsing. `exclude` omits one dimension's own
/// condition — used by facet counting, see `computeFacets` below.
function buildStructuredFilters(
  query: SearchQuery,
  categoryIds: string[] | null,
  exclude: Set<FilterDimension> = new Set(),
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (!exclude.has('category') && categoryIds !== null) {
    if (categoryIds.length === 0) {
      // Requested category slug didn't resolve to anything real —
      // return zero rows rather than silently ignoring the filter.
      conditions.push(Prisma.sql`FALSE`);
    } else {
      conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds)})`);
    }
  }
  if (!exclude.has('origin') && query.origin && query.origin.length > 0) {
    conditions.push(Prisma.sql`p."origin" IN (${Prisma.join(query.origin)})`);
  }
  if (!exclude.has('inStock') && query.inStock !== undefined) {
    conditions.push(Prisma.sql`p."inStock" = ${query.inStock}`);
  }
  if (!exclude.has('onSale') && query.onSale === true) {
    conditions.push(Prisma.sql`p."comparePrice" IS NOT NULL`);
  }
  if (!exclude.has('onSale') && query.onSale === false) {
    conditions.push(Prisma.sql`p."comparePrice" IS NULL`);
  }
  if (!exclude.has('price') && query.minPrice !== undefined) {
    conditions.push(Prisma.sql`p."price" >= ${query.minPrice}`);
  }
  if (!exclude.has('price') && query.maxPrice !== undefined) {
    conditions.push(Prisma.sql`p."price" <= ${query.maxPrice}`);
  }
  if (!exclude.has('minRating') && query.minRating !== undefined && query.minRating > 0) {
    conditions.push(Prisma.sql`p."rating" >= ${query.minRating}`);
  }
  // Deliverability — business re-ranking Section 9 treats this as a hard
  // filter, not a soft demotion: an undeliverable result is a broken
  // promise, not a lower-quality one. Never excluded from facet
  // counting — showing counts that include undeliverable products
  // would be its own broken promise.
  if (query.shipsToMe === true && query.country) {
    const c = query.country.toUpperCase();
    conditions.push(
      Prisma.sql`(cardinality(p."sellableCountries") = 0 OR ${c} = ANY(p."sellableCountries") OR p."origin" = ${c})`,
    );
  }
  // Storefront visibility rule (2026-08-18) — same as the plain shop
  // listing (`products/repository.ts`): a product with no real photo
  // doesn't surface to customers, search included. Always on, never
  // excludable (not a `FilterDimension` — there's no facet for it).
  conditions.push(Prisma.sql`cardinality(p."images") > 0`);

  return conditions;
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

/// Phase 1 — the tsquery expression, folded through the same
/// `immutable_unaccent` logic the generated column indexes with (see
/// migration `20260817120000_search_phase1_query_understanding`), so
/// "café" matches products indexed as "cafe" and vice versa.
/// `tsQueryExpr` (from `buildSynonymExpansion`) takes priority when a
/// query word hit the synonym dictionary; otherwise this is the plain
/// Phase-0 `plainto_tsquery` path, byte-for-byte the same query shape
/// as before this migration for the common case.
function tsQueryFragment(normalizedQuery: string, tsQueryExpr: string | null): Prisma.Sql {
  return tsQueryExpr
    ? Prisma.sql`to_tsquery('simple', unaccent(${tsQueryExpr}))`
    : Prisma.sql`plainto_tsquery('simple', unaccent(${normalizedQuery}))`;
}

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
  tsQueryExpr: string | null = null,
): Promise<SearchRow[]> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;
  const orderBy = orderByClause(query.sort, true);
  const tsQuery = tsQueryFragment(normalizedQuery, tsQueryExpr);

  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT ${SELECT_FIELDS}, ts_rank_cd(p."searchVector", query) AS rank
    ${FROM_JOIN}, ${tsQuery} query
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
  tsQueryExpr: string | null = null,
): Promise<number> {
  const filters = buildStructuredFilters(query, categoryIds);
  const whereExtra = filters.length > 0 ? Prisma.join(filters, ' AND ', 'AND ') : Prisma.empty;
  const tsQuery = tsQueryFragment(normalizedQuery, tsQueryExpr);

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    ${FROM_JOIN}, ${tsQuery} query
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

export interface SearchFacets {
  origin: Record<string, number>;
  /// Each entry is "count of results with rating >= min" — matches
  /// the sidebar's "4 & up" style checkboxes, which are minimums, not
  /// exact buckets.
  rating: Array<{ min: number; count: number }>;
  inStock: number;
  onSale: number;
}

const RATING_THRESHOLDS = [5, 4, 3, 2, 1] as const;

/**
 * Phase 0 "Facets" checklist item — counts for the filter groups the
 * frontend actually renders on `/search` (origin, rating, in-stock,
 * on-sale; see `FiltersSidebar` — the category group is hidden there
 * today, so no category facet yet). Each dimension's count excludes
 * its own filter (standard faceted-search convention: checking "In
 * Stock" shouldn't make the "In Stock" count collapse to itself) but
 * keeps every other active filter and the text match condition, so
 * counts describe "if you also picked this" rather than the current
 * result set.
 *
 * `matchClause` is whichever retrieval condition actually produced
 * results (lexical `@@ query`, or the trigram fallback's `similarity`
 * predicate) — passed in by the caller so facets stay consistent with
 * what's on screen instead of silently re-running lexical matching
 * when the response came from the fallback.
 */
async function computeFacets(
  query: SearchQuery,
  categoryIds: string[] | null,
  matchClause: Prisma.Sql,
): Promise<SearchFacets> {
  const originFilters = buildStructuredFilters(query, categoryIds, new Set(['origin']));
  const originWhere =
    originFilters.length > 0 ? Prisma.join(originFilters, ' AND ', 'AND ') : Prisma.empty;

  const ratingFilters = buildStructuredFilters(query, categoryIds, new Set(['minRating']));
  const ratingWhere =
    ratingFilters.length > 0 ? Prisma.join(ratingFilters, ' AND ', 'AND ') : Prisma.empty;

  const inStockFilters = buildStructuredFilters(query, categoryIds, new Set(['inStock']));
  const inStockWhere =
    inStockFilters.length > 0 ? Prisma.join(inStockFilters, ' AND ', 'AND ') : Prisma.empty;

  const onSaleFilters = buildStructuredFilters(query, categoryIds, new Set(['onSale']));
  const onSaleWhere =
    onSaleFilters.length > 0 ? Prisma.join(onSaleFilters, ' AND ', 'AND ') : Prisma.empty;

  const [originRows, ratingRow, inStockRow, onSaleRow] = await Promise.all([
    prisma.$queryRaw<Array<{ origin: string | null; count: bigint }>>(Prisma.sql`
      SELECT p."origin", COUNT(*)::bigint AS count
      ${FROM_JOIN}
      WHERE ${matchClause} AND p."origin" IS NOT NULL
      ${originWhere}
      GROUP BY p."origin"
    `),
    prisma.$queryRaw<Array<{ r5: bigint; r4: bigint; r3: bigint; r2: bigint; r1: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE p."rating" >= 5)::bigint AS r5,
        COUNT(*) FILTER (WHERE p."rating" >= 4)::bigint AS r4,
        COUNT(*) FILTER (WHERE p."rating" >= 3)::bigint AS r3,
        COUNT(*) FILTER (WHERE p."rating" >= 2)::bigint AS r2,
        COUNT(*) FILTER (WHERE p."rating" >= 1)::bigint AS r1
      ${FROM_JOIN}
      WHERE ${matchClause}
      ${ratingWhere}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      ${FROM_JOIN}
      WHERE ${matchClause} AND p."inStock" = true
      ${inStockWhere}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      ${FROM_JOIN}
      WHERE ${matchClause} AND p."comparePrice" IS NOT NULL
      ${onSaleWhere}
    `),
  ]);

  const origin: Record<string, number> = {};
  for (const row of originRows) {
    if (row.origin) origin[row.origin] = Number(row.count);
  }

  const ratingCounts = ratingRow[0] as Record<string, bigint> | undefined;
  const rating = RATING_THRESHOLDS.map((min) => ({
    min,
    count: ratingCounts ? Number(ratingCounts[`r${min}`]) : 0,
  }));

  return {
    origin,
    rating,
    inStock: Number(inStockRow[0]?.count ?? 0),
    onSale: Number(onSaleRow[0]?.count ?? 0),
  };
}

/// Facets for the lexical-match path — same `@@ query` condition
/// `lexicalSearch`/`lexicalSearchCount` use, so counts match the
/// results shown.
export async function lexicalFacets(
  query: SearchQuery,
  normalizedQuery: string,
  categoryIds: string[] | null,
  tsQueryExpr: string | null = null,
): Promise<SearchFacets> {
  const tsQuery = tsQueryFragment(normalizedQuery, tsQueryExpr);
  return computeFacets(
    query,
    categoryIds,
    Prisma.sql`p."searchVector" @@ ${tsQuery}`,
  );
}

/// Facets for the trigram zero-result-recovery path.
export async function trigramFacets(
  query: SearchQuery,
  rawQuery: string,
  categoryIds: string[] | null,
): Promise<SearchFacets> {
  return computeFacets(
    query,
    categoryIds,
    Prisma.sql`similarity(p."name", ${rawQuery}) > 0.2`,
  );
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
      AND cardinality(p."images") > 0
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
  durationMs?: number;
  script?: string;
  usedFallback?: boolean;
  didYouMeanShown?: boolean;
}): Promise<string> {
  const created = await prisma.searchQueryLog.create({
    data: {
      rawQuery: row.rawQuery,
      normalizedQuery: row.normalizedQuery,
      resultCount: row.resultCount,
      userId: row.userId ?? null,
      sessionId: row.sessionId ?? null,
      country: row.country ?? null,
      durationMs: row.durationMs ?? null,
      script: row.script ?? null,
      usedFallback: row.usedFallback ?? false,
      didYouMeanShown: row.didYouMeanShown ?? false,
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

/// Phase 1 — seed synonym dictionary lookup (spec Section 6.1). Fetches
/// every `SearchSynonym` group touching any of the given (already
/// lowercased) tokens, via the array-overlap `&&` operator against
/// `terms`, which uses the GIN index from the Phase 1 migration.
export async function fetchSynonymGroups(tokens: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (tokens.length === 0) return map;

  const rows = await prisma.searchSynonym.findMany({
    where: { terms: { hasSome: tokens } },
    select: { terms: true },
  });
  for (const token of tokens) {
    const group = rows.find((r) => r.terms.includes(token));
    if (group) map.set(token, group.terms);
  }
  return map;
}

/// Splits into to_tsquery-safe lexeme "words" — letters, digits, and
/// apostrophes are the only characters that can appear inside a
/// to_tsquery lexeme without being parsed as an operator (`&`, `|`,
/// `!`, `(`, `)`, `<->`, `:`).
const TS_WORD_RE = /[\p{L}\p{N}']+/gu;

function tokenizeForTsQuery(text: string): string[] {
  return text.match(TS_WORD_RE) ?? [];
}

/// A synonym group member may itself be multiple words ("garden egg")
/// — represented as an AND-group of its own words, since to_tsquery
/// has no phrase-as-a-single-token syntax outside `<->` proximity,
/// which is overkill for a synonym dictionary.
function synonymMemberToTsExpr(member: string): string {
  const words = tokenizeForTsQuery(member);
  if (words.length === 0) return '';
  return words.length === 1 ? words[0] : `(${words.join(' & ')})`;
}

/**
 * Phase 1 synonym expansion (spec Section 6.1). Builds an explicit
 * to_tsquery expression like `(garri|gari) & fifty`, so a search for
 * "garri fifty" also matches products indexed only as "gari".
 *
 * Returns `null` when none of the query's words hit the synonym
 * dictionary — callers fall back to the Phase-0 `plainto_tsquery`
 * path unchanged in that case, so the vast majority of searches (no
 * dictionary hit) see zero behavioural change from Phase 1.
 */
export function buildSynonymExpansion(
  normalizedQuery: string,
  synonymsByToken: Map<string, string[]>,
): string | null {
  if (synonymsByToken.size === 0) return null;
  const tokens = tokenizeForTsQuery(normalizedQuery);
  if (tokens.length === 0) return null;

  const groupExprs = tokens.map((token) => {
    const members = synonymsByToken.get(token);
    if (!members || members.length === 0) return synonymMemberToTsExpr(token);
    const exprs = [...new Set(members.map(synonymMemberToTsExpr).filter(Boolean))];
    if (exprs.length === 0) return synonymMemberToTsExpr(token);
    return exprs.length > 1 ? `(${exprs.join('|')})` : exprs[0];
  });

  const expr = groupExprs.filter(Boolean).join(' & ');
  return expr || null;
}

export interface DidYouMeanCandidate {
  normalizedQuery: string;
  frequency: bigint;
  similarity: number;
}

/**
 * Phase 1 "spell correction (query-log-mined)" checklist item.
 * Reformulation mining, not a dictionary speller: when the current
 * query returned few/no results, look for a DIFFERENT past query that
 * (a) is trigram-similar to this one (catches typos: "shea buttr" ->
 * "shea butter"), (b) has actually returned results historically, and
 * (c) is more frequent than a one-off — so a single fat-fingered past
 * query can't nominate itself. `resultCount > currentResultCount`
 * isn't required here (service.ts checks that against the live count
 * before surfacing the suggestion, since a logged `resultCount` can
 * go stale as the catalogue changes).
 */
export async function suggestCorrection(
  normalizedQuery: string,
): Promise<DidYouMeanCandidate | null> {
  const rows = await prisma.$queryRaw<DidYouMeanCandidate[]>(Prisma.sql`
    SELECT "normalizedQuery", COUNT(*)::bigint AS frequency,
           MAX(similarity("normalizedQuery", ${normalizedQuery})) AS similarity
    FROM "SearchQueryLog"
    WHERE "resultCount" > 0
      AND "normalizedQuery" != ${normalizedQuery}
      AND similarity("normalizedQuery", ${normalizedQuery}) > 0.4
    GROUP BY "normalizedQuery"
    HAVING COUNT(*) >= 2
    ORDER BY similarity DESC, frequency DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}
