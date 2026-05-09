import { z } from 'zod';

/// Body for create + full update. PATCH uses `.partial()` so the
/// storefront can flip just `isDefault` or just one field without
/// re-sending the whole record.
export const upsertAddressBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{7,15}$/, 'Use E.164 format like +2348012345678'),
  addressLine: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(80),
  /// 2-letter ISO country code, uppercased so client casing doesn't
  /// matter. Matches the storefront's COUNTRIES list.
  country: z
    .string()
    .trim()
    .length(2)
    .transform((v) => v.toUpperCase()),
  label: z.string().trim().max(40).nullish(),
  /// When `true`, the service flips every other address on this user
  /// to `false` so exactly one is default at a time. When omitted on
  /// create, the first address a user creates is auto-default.
  isDefault: z.boolean().optional(),
});
export type UpsertAddressBody = z.infer<typeof upsertAddressBodySchema>;

export const partialAddressBodySchema = upsertAddressBodySchema.partial();
export type PartialAddressBody = z.infer<typeof partialAddressBodySchema>;
