import { z } from 'zod';

/**
 * Zod schemas for the Products module.
 *
 * Used by:
 *  - Controller: validates `req.query` / `req.params` at the API edge.
 *  - Service: types its inputs.
 *  - (Future) generates the OpenAPI schema for SDK + docs.
 */

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
  category: z.string().optional(),
  origin: z.string().length(2).optional(),
  q: z.string().optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  onSale: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Phase 10.7 — filter by placement key (e.g. "homepage_hero", "cms:black-friday"). */
  placement: z.string().optional(),
  /** Country scope used together with placement; ignored otherwise. */
  country: z.string().length(2).optional(),
  sort: z
    .enum(['featured', 'newest', 'price-asc', 'price-desc', 'rating'])
    .default('featured'),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productSlugParamSchema = z.object({
  slug: z.string().min(1),
});
