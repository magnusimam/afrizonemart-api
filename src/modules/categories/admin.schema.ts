import { z } from 'zod';

export const upsertCategoryBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens'),
  name: z.string().trim().min(1).max(120),
  image: z.string().url().nullish(),
});
export type UpsertCategoryBody = z.infer<typeof upsertCategoryBodySchema>;

export const partialCategoryBodySchema = upsertCategoryBodySchema.partial();
export type PartialCategoryBody = z.infer<typeof partialCategoryBodySchema>;
