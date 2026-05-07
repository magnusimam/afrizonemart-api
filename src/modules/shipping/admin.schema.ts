import { z } from 'zod';

export const upsertZoneBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Empty array allowed only when isDefault=true (catch-all "rest of world").
  countries: z.array(z.string().length(2)).default([]),
  /// Phase 11 — optional sub-country city restriction. Empty = whole
  /// country zone. Non-empty = flagship-city zone (Lagos, Joburg, …).
  cities: z.array(z.string().trim().min(1).max(120)).default([]),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type UpsertZoneBody = z.infer<typeof upsertZoneBodySchema>;

export const partialZoneBodySchema = upsertZoneBodySchema.partial();
export type PartialZoneBody = z.infer<typeof partialZoneBodySchema>;

export const upsertRateBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceAmount: z.number().int().nonnegative().default(0),
  freeAboveAmount: z.number().int().nonnegative().nullish(),
  /// Phase 11 — weight bracket bounds in kilograms. Null = unbounded.
  /// `minWeightKg = null, maxWeightKg = null` is the back-compat
  /// "matches every cart" rate.
  minWeightKg: z.number().nonnegative().nullish(),
  maxWeightKg: z.number().nonnegative().nullish(),
  /// Phase 11 — ETA shown to the customer. Inclusive range.
  etaDaysMin: z.number().int().min(0).max(365).default(3),
  etaDaysMax: z.number().int().min(0).max(365).default(7),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type UpsertRateBody = z.infer<typeof upsertRateBodySchema>;

export const partialRateBodySchema = upsertRateBodySchema.partial();
export type PartialRateBody = z.infer<typeof partialRateBodySchema>;
