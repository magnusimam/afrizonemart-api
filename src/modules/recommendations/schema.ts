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

export const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(30).default(12),
  country: z.string().length(2).optional(),
  surface: z.enum(['pdp', 'home', 'cart', 'category']).default('home'),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
export type TrendingQuery = z.infer<typeof trendingQuerySchema>;

/// Fired by the client when a viewer clicks a recommended item — same
/// first-click-wins convention as `modules/search`'s
/// `trackClickBodySchema`.
export const trackClickBodySchema = z.object({
  impressionId: z.string().min(1),
  productId: z.string().min(1),
});
export type TrackClickBody = z.infer<typeof trackClickBodySchema>;
