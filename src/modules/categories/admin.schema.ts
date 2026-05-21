import { z } from 'zod';

export const categoryArchetypeEnum = z.enum(['GROCERY', 'WINE', 'LIFESTYLE', 'FASHION']);
export type CategoryArchetypeValue = z.infer<typeof categoryArchetypeEnum>;

export const upsertCategoryBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens'),
  name: z.string().trim().min(1).max(120),
  image: z.string().url().nullish(),
  parentId: z.string().trim().min(1).nullish(),
  /// Drives the mobile PDP visual treatment. Defaults to FASHION on
  /// new rows (Prisma default); admin can override on edit.
  archetype: categoryArchetypeEnum.optional(),
});
export type UpsertCategoryBody = z.infer<typeof upsertCategoryBodySchema>;

export const partialCategoryBodySchema = upsertCategoryBodySchema.partial();
export type PartialCategoryBody = z.infer<typeof partialCategoryBodySchema>;
