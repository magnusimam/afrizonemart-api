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
  /**
   * ISO-3166 alpha-2 country code(s) to match against `Product.origin`.
   * Accepts a single code (`?origin=NG`) or a CSV (`?origin=NG,KE,ZA`).
   * Always returns `string[] | undefined` to the service layer so the
   * repository can branch on `where.origin = code` vs `{ in: codes }`.
   */
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
  q: z.string().optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  onSale: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /// Storefront filter sidebar — min/max product price in Naira whole
  /// units (matches `Product.price` storage). Either bound can be set
  /// independently. Repository applies `where.price = { gte/lte }`.
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  /// Storefront filter sidebar — minimum average review rating
  /// (`Product.rating`, 0..5 inclusive). UI exposes 1..5 only; the
  /// '5' bucket means "5.0 exact-or-near", which we treat as >= 4.5
  /// so a 4.8-rated product still surfaces. Mirrored on the
  /// frontend in FiltersSidebar.
  minRating: z.coerce.number().min(0).max(5).optional(),
  /** Phase 10.7 — filter by placement key (e.g. "homepage_hero", "cms:black-friday"). */
  placement: z.string().optional(),
  /** Country scope used together with placement; ignored otherwise. */
  country: z.string().length(2).optional(),
  /**
   * Phase 10.8 — explicit product-id list. Accepts either a CSV string
   * or repeated query keys (`?ids=a&ids=b`). When set, the response is
   * exactly these products, in this order, and other filters except
   * `inStock` are ignored. Used by manual-mode product-grid sections
   * and any UI that fetches a hand-picked list.
   */
  ids: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const arr = Array.isArray(v) ? v : v.split(',');
      const cleaned = arr.map((s) => s.trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned.slice(0, 100) : undefined;
    }),
  sort: z
    .enum(['featured', 'newest', 'price-asc', 'price-desc', 'rating', 'trending'])
    .default('featured'),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productSlugParamSchema = z.object({
  slug: z.string().min(1),
});
