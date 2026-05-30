import { z } from 'zod';

/**
 * Validation for the admin views dashboard.
 *
 * All endpoints are window-based — admin picks a date range expressed
 * as a number of trailing days. Capped at 90 because that's our
 * ProductView retention; anything older has been pruned.
 */

export const topProductsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(7),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

export const productViewsParamSchema = z.object({
  slug: z.string().trim().min(1),
});

export const productViewsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(30),
});
export type ProductViewsQuery = z.infer<typeof productViewsQuerySchema>;
