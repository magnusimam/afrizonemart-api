import { z } from 'zod';

/**
 * Zod schemas for the Recommendations module (Phase 0 — see
 * Afrizonemart_Recommendations_Personalization_Design_Spec.docx and
 * ALGORITHM_SYSTEMS_TRACKER.md).
 *
 * `country`/`sessionId` mirror `modules/search/schema.ts` exactly —
 * same deliverability-filter and query-log-attribution conventions.
 */

export const similarQuerySchema = z.object({
  /// Seed product — the PDP the "similar products" module is shown
  /// on. Slug, not id, so the client never needs a separate lookup.
  slug: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().positive().max(30).default(12),
  country: z.string().length(2).optional(),
  surface: z.enum(['pdp', 'home', 'cart', 'category']).default('pdp'),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
export type SimilarQuery = z.infer<typeof similarQuerySchema>;

/// "Customers also bought" and "Viewed also viewed" — both single-seed
/// PDP modules, same shape as `similarQuerySchema`.
export const alsoBoughtQuerySchema = similarQuerySchema;
export type AlsoBoughtQuery = SimilarQuery;
export const viewedAlsoViewedQuerySchema = similarQuerySchema;
export type ViewedAlsoViewedQuery = SimilarQuery;

/// "Frequently bought together" — multi-seed (cart contents), so it
/// takes a comma-separated list of slugs instead of one `slug`.
export const frequentlyBoughtTogetherQuerySchema = z.object({
  slugs: z
    .string()
    .trim()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1).max(20)),
  limit: z.coerce.number().int().positive().max(30).default(12),
  country: z.string().length(2).optional(),
  surface: z.enum(['pdp', 'home', 'cart', 'category']).default('cart'),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
export type FrequentlyBoughtTogetherQuery = z.infer<typeof frequentlyBoughtTogetherQuerySchema>;

export const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(30).default(12),
  country: z.string().length(2).optional(),
  surface: z.enum(['pdp', 'home', 'cart', 'category']).default('home'),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
export type TrendingQuery = z.infer<typeof trendingQuerySchema>;

/// Phase 2 — "For You" and "Recently viewed", both seedless (userId
/// comes from the auth context, not the query string) and home-scoped
/// by default, same shape as `trendingQuerySchema`.
export const forYouQuerySchema = trendingQuerySchema;
export type ForYouQuery = TrendingQuery;
export const recentlyViewedQuerySchema = trendingQuerySchema;
export type RecentlyViewedQuery = TrendingQuery;

/// Fired by the client when a viewer clicks a recommended item — same
/// first-click-wins convention as `modules/search`'s
/// `trackClickBodySchema`.
export const trackClickBodySchema = z.object({
  impressionId: z.string().min(1),
  productId: z.string().min(1),
});
export type TrackClickBody = z.infer<typeof trackClickBodySchema>;
