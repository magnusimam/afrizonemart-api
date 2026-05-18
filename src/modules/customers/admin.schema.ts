import { z } from 'zod';

/// Mirrors the prisma UserRole enum 1:1. STAFF was missing before
/// 2026-05-18 — its absence here AND in the storefront types caused
/// /admin/customers to crash whenever a STAFF row appeared, since
/// the RoleBadge styles map had no entry for it.
const role = z.enum(['CUSTOMER', 'SELLER', 'ADMIN', 'STAFF']);

/// Split the user list into "Customers" (have ever placed a
/// non-cancelled order) vs "Users" (account exists, never bought).
/// "all" keeps the legacy unfiltered behaviour.
const customerSegment = z.enum(['customers', 'users', 'all']);

export const adminCustomerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().optional(),
  role: role.optional(),
  segment: customerSegment.default('all'),
  sort: z.enum(['newest', 'oldest', 'name-asc', 'spend-desc']).default('newest'),
});
export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>;

export const updateCustomerBodySchema = z.object({
  name: z.string().trim().min(1).max(120).nullish(),
  role: role.optional(),
});
export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;
