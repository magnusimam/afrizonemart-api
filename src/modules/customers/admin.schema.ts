import { z } from 'zod';

const role = z.enum(['CUSTOMER', 'SELLER', 'ADMIN']);

export const adminCustomerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().optional(),
  role: role.optional(),
  sort: z.enum(['newest', 'oldest', 'name-asc', 'spend-desc']).default('newest'),
});
export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>;

export const updateCustomerBodySchema = z.object({
  name: z.string().trim().min(1).max(120).nullish(),
  role: role.optional(),
});
export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;
