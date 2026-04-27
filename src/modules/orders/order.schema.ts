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
});
export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>;
