import { z } from 'zod';

const orderStatusEnum = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

export const adminOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  status: orderStatusEnum.optional(),
  q: z.string().optional(), // matches orderNumber, customer email, or customer name
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export const updateStatusBodySchema = z.object({
  status: orderStatusEnum,
  note: z.string().trim().max(1000).optional(),
});
export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>;

export const addNoteBodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  isCustomerVisible: z.boolean().default(false),
});
export type AddNoteBody = z.infer<typeof addNoteBodySchema>;

export const recordRefundBodySchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
});
export type RecordRefundBody = z.infer<typeof recordRefundBodySchema>;
