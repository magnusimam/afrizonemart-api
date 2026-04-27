import { z } from 'zod';

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only');

export const placementInputSchema = z.object({
  placement: z.string().min(1),
  sortOrder: z.number().int().nonnegative().default(100),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  countries: z.array(z.string().length(2)).default([]),
});
export type PlacementInputBody = z.infer<typeof placementInputSchema>;

export const upsertProductBodySchema = z.object({
  slug,
  name: z.string().trim().min(1).max(240),
  brand: z.string().trim().max(120).nullish(),
  shortDescription: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(20000).nullish(),
  ingredients: z.string().trim().max(4000).nullish(),
  price: z.number().int().nonnegative(),
  comparePrice: z.number().int().nonnegative().nullish(),
  origin: z.string().length(2).nullish(),
  inStock: z.boolean().default(true),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().nonnegative().default(0),
  images: z.array(z.string()).default([]),
  attributes: z.record(z.string(), z.unknown()).default({}),
  categorySlug: z.string().min(1).nullish(),
  placements: z.array(placementInputSchema).optional(),
});
export type UpsertProductBody = z.infer<typeof upsertProductBodySchema>;

export const partialProductBodySchema = upsertProductBodySchema.partial();
export type PartialProductBody = z.infer<typeof partialProductBodySchema>;

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().optional(),
  category: z.string().optional(),
  inStock: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['newest', 'oldest', 'name-asc', 'price-desc']).default('newest'),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
