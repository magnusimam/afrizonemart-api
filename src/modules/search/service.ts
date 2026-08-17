import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { categorySlugWithDescendants } from '@/modules/products/repository';
import type { AutocompleteQuery, SearchQuery } from './schema';
import { detectScript } from './script-detect';
import {
  buildSynonymExpansion,
  fetchSynonymGroups,
  insertSearchQueryLog,
  lexicalFacets,
  lexicalSearch,
  lexicalSearchCount,
  recordSearchClick,
  suggestCorrection,
  suggestProducts,
  suggestQueries,
  trigramFacets,
  trigramFallbackCount,
  trigramFallbackSearch,
  type SearchFacets,
  type SearchRow,
} from './repository';

/// "Did you mean" is only worth the extra queries when the primary
/// result set is thin — a healthy result count means the searcher
/// found what they typed, reformulation risk outweighs the benefit.
const DID_YOU_MEAN_RESULT_THRESHOLD = 3;

/**
 * Business logic for Search & Discovery Phase 0 (see
 * `Afrizonemart_Search_Discovery_Design_Spec.docx`,
 * ALGORITHM_SYSTEMS_TRACKER.md for the full roadmap).
 *
 * Pipeline (spec Section 4.1), Phase-0-scoped:
 *   query understanding (normalize) → retrieval (lexical, trigram
 *   fallback) → ranking (ts_rank_cd + quality tie-breakers) → serve +
 *   log. Semantic retrieval, learned ranking, and bounded business
 *   boosts beyond the deliverability hard-filter are Phase 2/3 —
 *   deliberately not built here yet.
 */

/// Query understanding, Phase 0 slice: Unicode-normalize, trim, fold
/// case, collapse whitespace. Diacritic folding, per-language
/// tokenization, and spell correction are Phase 1 (spec Section 6.1) —
/// `plainto_tsquery('simple', …)` downstream already handles basic
/// stopword/punctuation stripping.
export function normalizeQuery(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function serializeRow(row: SearchRow) {
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

async function resolveCategoryIds(slug: string | undefined): Promise<string[] | null> {
  if (!slug) return null;
  const slugs = await categorySlugWithDescendants(slug);
  const rows = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/// The tsvector-word tokenizer used for synonym lookups needs to agree
/// with `to_tsquery`'s own lexeme rules (letters/digits/apostrophes) —
/// see `repository.ts:tokenizeForTsQuery`. Duplicated narrowly here so
/// the service layer doesn't need a DB round-trip just to know which
/// words to look up.
const WORD_RE = /[\p{L}\p{N}']+/gu;

export interface SearchResult {
  items: ReturnType<typeof serializeRow>[];
  pagination: { page: number; limit: number; total: number; pages: number };
  /// True when the primary lexical match found nothing and this
  /// response came from the trigram fallback instead — lets the
  /// frontend show a "showing results for…" affordance.
  usedFallback: boolean;
  /// Id of the SearchQueryLog row this search produced. The client
  /// passes it back on `POST /api/search/click` to attribute a click
  /// to the query that produced it.
  queryLogId: string | null;
  /// Phase 0 facet counts (origin/rating/inStock/onSale) — see
  /// `repository.ts:computeFacets`. Null when the query was empty
  /// (nothing to facet) or the facet queries themselves failed —
  /// facets are supplementary, never worth breaking search over.
  facets: SearchFacets | null;
  /// Phase 1 "did you mean" reformulation suggestion — only populated
  /// when this query's own results are thin AND a query-log-mined
  /// candidate exists that would return strictly more.
  didYouMean: string | null;
}

export async function search(
  query: SearchQuery,
  ctx: { userId?: string },
): Promise<SearchResult> {
  const start = Date.now();
  const normalizedQuery = normalizeQuery(query.q);
  if (!normalizedQuery) {
    return {
      items: [],
      pagination: { page: query.page, limit: query.limit, total: 0, pages: 1 },
      usedFallback: false,
      queryLogId: null,
      facets: null,
      didYouMean: null,
    };
  }

  const categoryIds = await resolveCategoryIds(query.category);
  const offset = (query.page - 1) * query.limit;
  const script = detectScript(normalizedQuery);

  // Phase 1 synonym expansion — only touches the query shape when a
  // word actually hits the seed dictionary (see
  // `buildSynonymExpansion`'s doc comment).
  const tokens = normalizedQuery.match(WORD_RE) ?? [];
  let tsQueryExpr: string | null = null;
  try {
    const synonymsByToken = await fetchSynonymGroups(tokens);
    tsQueryExpr = buildSynonymExpansion(normalizedQuery, synonymsByToken);
  } catch (error) {
    logger.error('search.synonym_lookup_failed', { error });
  }

  let rows = await lexicalSearch(query, normalizedQuery, categoryIds, query.limit, offset, tsQueryExpr);
  let total = await lexicalSearchCount(query, normalizedQuery, categoryIds, tsQueryExpr);
  let usedFallback = false;

  // Zero-result recovery (spec Section 3.1/6.1) — only worth trying on
  // page 1; a lexical hit on page 1 with an empty page 3 just means
  // the requester paginated past the end, not that the query failed.
  if (total === 0 && query.page === 1) {
    rows = await trigramFallbackSearch(query, query.q, categoryIds, query.limit, offset);
    total = await trigramFallbackCount(query, query.q, categoryIds);
    usedFallback = rows.length > 0;
  }

  // Facets (Phase 0) — best-effort, never let a facet-query failure
  // take down the actual result response.
  let facets: SearchFacets | null = null;
  try {
    facets = usedFallback
      ? await trigramFacets(query, query.q, categoryIds)
      : await lexicalFacets(query, normalizedQuery, categoryIds, tsQueryExpr);
  } catch (error) {
    logger.error('search.facets_failed', { error });
  }

  // Did-you-mean (Phase 1) — only attempted on page 1 with thin
  // results; only surfaced when the candidate's LIVE result count
  // (not its stale logged count) actually beats what the searcher got.
  let didYouMean: string | null = null;
  if (query.page === 1 && total < DID_YOU_MEAN_RESULT_THRESHOLD) {
    try {
      const candidate = await suggestCorrection(normalizedQuery);
      if (candidate) {
        const candidateTotal = await lexicalSearchCount(query, candidate.normalizedQuery, categoryIds);
        if (candidateTotal > total) didYouMean = candidate.normalizedQuery;
      }
    } catch (error) {
      logger.error('search.did_you_mean_failed', { error });
    }
  }

  const durationMs = Date.now() - start;

  // Query-log loop (spec Section 16.3) — never let logging failure
  // break a search response.
  let queryLogId: string | null = null;
  try {
    queryLogId = await insertSearchQueryLog({
      rawQuery: query.q,
      normalizedQuery,
      resultCount: total,
      userId: ctx.userId,
      sessionId: query.sessionId,
      country: query.country,
      durationMs,
      script,
      usedFallback,
      didYouMeanShown: didYouMean !== null,
    });
  } catch (error) {
    logger.error('search.query_log_failed', { error });
  }

  return {
    items: rows.map(serializeRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
    usedFallback,
    queryLogId,
    facets,
    didYouMean,
  };
}

export interface AutocompleteResult {
  queries: string[];
  products: Array<{ id: string; slug: string; name: string; image: string | null; price: number }>;
}

export async function autocomplete(query: AutocompleteQuery): Promise<AutocompleteResult> {
  const prefix = normalizeQuery(query.q);
  if (!prefix) return { queries: [], products: [] };

  const [queryRows, productRows] = await Promise.all([
    suggestQueries(prefix, query.limit),
    suggestProducts(prefix, query.limit),
  ]);

  return {
    queries: queryRows.map((r) => r.normalizedQuery),
    products: productRows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      image: r.image,
      price: r.price,
    })),
  };
}

export async function trackSearchClick(queryLogId: string, productId: string): Promise<void> {
  await recordSearchClick(queryLogId, productId);
}
