import { z } from 'zod';

export const placeOrderBodySchema = z.object({
  shipping: z.object({
    fullName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(4).max(40),
    addressLine: z.string().trim().min(3).max(240),
    city: z.string().trim().min(1).max(80),
    country: z.string().length(2),
  }),
  paymentMethod: z
    .enum(['PAYSTACK', 'GTSQUAD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY'])
    .default('GTSQUAD'),
  // Shipping rate the customer picked at checkout. If omitted, the
  // service falls back to the default rate for the matched zone.
  shippingRateId: z.string().min(1).optional(),
  /// Continental Rewards (Tracker #44 PR 3) — number of Afrizone
  /// Coins the customer wants to apply to this order. Optional;
  /// 0 / omitted = no redemption. Server re-validates against the
  /// live balance + min/max rules in placeOrder; can't be trusted
  /// from the client.
  coinRedeemCoins: z.number().int().min(0).max(1_000_000).optional(),
});
export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>;
