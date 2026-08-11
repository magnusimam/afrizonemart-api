import { z } from 'zod';

/**
 * Zod schemas for the Search module.
 *
 * Filter fields (category/origin/price/rating/inStock/onSale/shipsToMe/
 * country) intentionally mirror `products/product.schema.ts` — search
 * results should honour the exact same commerce rules as browsing, so a
 * customer filtering "in stock, ships to me" gets consistent results
 * whether they typed a query or clicked the shop sidebar.
 */

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(24),
  category: z.string().optional(),
  origin: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const codes = v
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length === 2);
      return codes.length > 0 ? codes : undefined;
    }),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  onSale: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  shipsToMe: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  country: z.string().length(2).optional(),
  /// Opaque client-minted session id, same convention as `views/schema.ts`
  /// — used to attribute a search-log row without requiring login.
  sessionId: z.string().trim().min(1).max(80).optional(),
  sort: z.enum(['relevance', 'price-asc', 'price-desc', 'rating', 'newest']).default('relevance'),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(10).default(6),
});
export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;

/// Fired by the client when a searcher clicks a result — feeds the
/// query-log loop (spec Section 16.3) that later phases train a
/// learned ranker on. First click per query wins; see
/// `recordSearchClick`.
export const trackClickBodySchema = z.object({
  queryLogId: z.string().min(1),
  productId: z.string().min(1),
});
export type TrackClickBody = z.infer<typeof trackClickBodySchema>;
