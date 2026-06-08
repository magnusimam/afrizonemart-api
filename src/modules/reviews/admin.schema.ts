import { z } from 'zod';

export const adminReviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  productId: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verified: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  hidden: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

export const updateReviewBodySchema = z.object({
  verified: z.boolean().optional(),
  title: z.string().trim().max(200).nullish(),
  body: z.string().trim().max(8000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  /// Soft-delete flag. When admin hides, the review stays in the
  /// DB (so we keep an audit trail) but is excluded from the
  /// public list + the product-rating aggregate. Optional reason
  /// goes into the audit string.
  hidden: z.boolean().optional(),
  hiddenReason: z.string().trim().max(500).nullish(),
});
export type UpdateReviewBody = z.infer<typeof updateReviewBodySchema>;
