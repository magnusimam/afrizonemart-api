import { z } from 'zod';

/// Tracker #45 — cart lines reference a ProductVariant, not a Product.
/// `productId` is still accepted for backwards compat: if the storefront
/// only sends productId we resolve it to the product's default variant
/// server-side. Once every client has rolled, the productId field can
/// be dropped.
export const cartItemInputSchema = z.object({
  productVariantId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  variantLabel: z.string().max(120).nullish(),
  quantity: z.number().int().positive().max(99),
}).refine(
  (i) => Boolean(i.productVariantId || i.productId),
  { message: 'productVariantId or productId is required', path: ['productVariantId'] },
);

export const replaceCartBodySchema = z.object({
  items: z.array(cartItemInputSchema).max(100),
});
export type ReplaceCartBody = z.infer<typeof replaceCartBodySchema>;
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const applyCouponBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
});
export type ApplyCouponBody = z.infer<typeof applyCouponBodySchema>;
