import { z } from 'zod';

export const adminReviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  productId: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verified: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

export const updateReviewBodySchema = z.object({
  verified: z.boolean().optional(),
  title: z.string().trim().max(200).nullish(),
  body: z.string().trim().max(8000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});
export type UpdateReviewBody = z.infer<typeof updateReviewBodySchema>;
