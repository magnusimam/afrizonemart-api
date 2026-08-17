import { z } from 'zod';

/**
 * Validation for the admin search-quality dashboard (Phase 0 "p95 <
 * 200ms" / "zero-result rate < 5%" checklist items — see
 * ALGORITHM_SYSTEMS_TRACKER.md). Window-based like the views
 * dashboard's `topProductsQuerySchema`.
 */
export const searchStatsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(7),
});
export type SearchStatsQuery = z.infer<typeof searchStatsQuerySchema>;
