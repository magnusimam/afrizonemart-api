import { z } from 'zod';

const couponType = z.enum(['PERCENT_CART', 'FIXED_CART', 'FREE_SHIPPING']);

export const upsertCouponBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only'),
    description: z.string().trim().max(500).nullish(),
    type: couponType,
    valuePercent: z.number().int().min(1).max(100).nullish(),
    valueAmount: z.number().int().nonnegative().nullish(),
    minSubtotal: z.number().int().nonnegative().nullish(),
    maxUses: z.number().int().positive().nullish(),
    maxUsesPerCustomer: z.number().int().positive().nullish(),
    startsAt: z.string().datetime().nullish(),
    endsAt: z.string().datetime().nullish(),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PERCENT_CART' && (v.valuePercent == null || v.valuePercent <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valuePercent'],
        message: 'valuePercent (1-100) is required for PERCENT_CART',
      });
    }
    if (v.type === 'FIXED_CART' && (v.valueAmount == null || v.valueAmount <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueAmount'],
        message: 'valueAmount > 0 is required for FIXED_CART',
      });
    }
  });
export type UpsertCouponBody = z.infer<typeof upsertCouponBodySchema>;

export const partialCouponBodySchema = z.object({
  description: z.string().trim().max(500).nullish().optional(),
  type: couponType.optional(),
  valuePercent: z.number().int().min(1).max(100).nullish().optional(),
  valueAmount: z.number().int().nonnegative().nullish().optional(),
  minSubtotal: z.number().int().nonnegative().nullish().optional(),
  maxUses: z.number().int().positive().nullish().optional(),
  maxUsesPerCustomer: z.number().int().positive().nullish().optional(),
  startsAt: z.string().datetime().nullish().optional(),
  endsAt: z.string().datetime().nullish().optional(),
  isActive: z.boolean().optional(),
});
export type PartialCouponBody = z.infer<typeof partialCouponBodySchema>;
