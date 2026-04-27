import { z } from 'zod';

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const salesQuerySchema = dateRangeSchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
export type SalesQuery = z.infer<typeof salesQuerySchema>;

export const topQuerySchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type TopQuery = z.infer<typeof topQuerySchema>;

export const lowStockQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
