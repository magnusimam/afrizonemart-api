import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { categorySlugWithDescendants } from '@/modules/products/repository';
import type { AutocompleteQuery, SearchQuery } from './schema';
import {
  insertSearchQueryLog,
  lexicalSearch,
  lexicalSearchCount,
  recordSearchClick,
  suggestProducts,
  suggestQueries,
  trigramFallbackCount,
  trigramFallbackSearch,
  type SearchRow,
} from './repository';

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
}

export async function search(
  query: SearchQuery,
  ctx: { userId?: string },
): Promise<SearchResult> {
  const normalizedQuery = normalizeQuery(query.q);
  if (!normalizedQuery) {
    return {
      items: [],
      pagination: { page: query.page, limit: query.limit, total: 0, pages: 1 },
      usedFallback: false,
      queryLogId: null,
    };
  }

  const categoryIds = await resolveCategoryIds(query.category);
  const offset = (query.page - 1) * query.limit;

  let rows = await lexicalSearch(query, normalizedQuery, categoryIds, query.limit, offset);
  let total = await lexicalSearchCount(query, normalizedQuery, categoryIds);
  let usedFallback = false;

  // Zero-result recovery (spec Section 3.1/6.1) — only worth trying on
  // page 1; a lexical hit on page 1 with an empty page 3 just means
  // the requester paginated past the end, not that the query failed.
  if (total === 0 && query.page === 1) {
    rows = await trigramFallbackSearch(query, query.q, categoryIds, query.limit, offset);
    total = await trigramFallbackCount(query, query.q, categoryIds);
    usedFallback = rows.length > 0;
  }

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
