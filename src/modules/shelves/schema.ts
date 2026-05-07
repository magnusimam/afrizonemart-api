import { z } from 'zod';

/**
 * Phase 10.8 — Shelves module schemas.
 *
 * A "shelf" is the container config (title, rows, cols, enabled) for a
 * placement key. Per-product membership lives in ProductPlacement.
 */

export const shelfKeyParamSchema = z.object({
  key: z.string().min(1).max(120),
});

export const shelfPublicQuerySchema = z.object({
  /// ISO-2 country code used to scope per-product country lists.
  country: z.string().length(2).optional(),
});

/// One country row in a rule-based shelf.
/// `country: null` means "any country" (catalog-wide).
export const countryRowSchema = z.object({
  country: z.string().length(2).nullable(),
  count: z.coerce.number().int().min(1).max(60),
});

/// PUT /admin/shelves/:key — update the container settings.
export const adminUpdateShelfSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(300).nullable().optional(),
  rows: z.coerce.number().int().min(1).max(20).optional(),
  cols: z.coerce.number().int().min(1).max(12).optional(),
  enabled: z.boolean().optional(),
  /// Phase 10.8b — country-rule shelves. Pass `null` or `[]` to clear
  /// rules and fall back to picks + fallback. Pass a non-empty array
  /// to switch the shelf into auto-fill mode.
  countryRows: z.array(countryRowSchema).nullable().optional(),
});

/// One product slot inside a shelf.
export const shelfProductSlotSchema = z.object({
  productId: z.string().min(1),
  /// 0..n — controls render order; service rewrites these so callers
  /// can pass arbitrary values and we normalise.
  sortOrder: z.coerce.number().int().min(0).default(0),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  countries: z.array(z.string().length(2)).default([]),
});

/// PUT /admin/shelves/:key/products — replace the full ordered list of
/// product slots in one batch.
export const adminSetShelfProductsSchema = z.object({
  items: z.array(shelfProductSlotSchema).max(200),
});

export type AdminUpdateShelfInput = z.infer<typeof adminUpdateShelfSchema>;
export type AdminSetShelfProductsInput = z.infer<typeof adminSetShelfProductsSchema>;
export type ShelfProductSlotInput = z.infer<typeof shelfProductSlotSchema>;
export type CountryRow = z.infer<typeof countryRowSchema>;
