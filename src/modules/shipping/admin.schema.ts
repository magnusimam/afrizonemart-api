import { z } from 'zod';

export const upsertZoneBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Empty array allowed only when isDefault=true (catch-all "rest of world").
  countries: z.array(z.string().length(2)).default([]),
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
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type UpsertRateBody = z.infer<typeof upsertRateBodySchema>;

export const partialRateBodySchema = upsertRateBodySchema.partial();
export type PartialRateBody = z.infer<typeof partialRateBodySchema>;
