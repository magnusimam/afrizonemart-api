import { z } from 'zod';

/**
 * Validation for the public reviews flow (customer-facing list + create).
 *
 * Admin moderation has its own schemas in `admin.schema.ts`.
 *
 * `body` is the meat of the review (constrained 1–2000 chars so the
 * form has a sensible max + Google's review-snippet picks up real
 * text). `rating` is a 1–5 integer — the Product.rating aggregate is
 * a Float average, but each individual vote is integer stars.
 */

export const createReviewBodySchema = z.object({
  productSlug: z.string().trim().min(1).max(160),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120).nullish(),
  body: z.string().trim().min(1).max(2000),
});
export type CreateReviewBody = z.infer<typeof createReviewBodySchema>;

export const listReviewsQuerySchema = z.object({
  productSlug: z.string().trim().min(1).max(160),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
