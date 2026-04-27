import { z } from 'zod';

export const cartItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(99),
});

export const replaceCartBodySchema = z.object({
  items: z.array(cartItemInputSchema).max(100),
});
export type ReplaceCartBody = z.infer<typeof replaceCartBodySchema>;

export const applyCouponBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
});
export type ApplyCouponBody = z.infer<typeof applyCouponBodySchema>;
