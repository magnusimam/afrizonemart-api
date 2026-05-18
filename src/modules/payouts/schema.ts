import { z } from 'zod';

/// Optional ISO date string. Cleaner than threading two zod refines
/// into every payout endpoint.
const dateLike = z
  .string()
  .datetime()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined));

export const listPayoutsQuerySchema = z.object({
  internId: z.string().min(1).optional(),
  /// 'draft' = paidAt is null. 'paid' = paidAt set. 'all' = both.
  /// Defaults to 'all' so the admin index page shows everything by
  /// default; the UI filters client-side too.
  status: z.enum(['draft', 'paid', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(200).default(100),
});
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;

/// Preview / draft both take the same window selectors. fromDate
/// and toDate filter against `reviewedAt` on the submission — that's
/// when the money became payable.
export const payoutWindowSchema = z.object({
  internId: z.string().min(1),
  fromDate: dateLike,
  toDate: dateLike,
});
export type PayoutWindow = z.infer<typeof payoutWindowSchema>;

export const finalizePayoutBodySchema = z.object({
  externalRef: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
export type FinalizePayoutBody = z.infer<typeof finalizePayoutBodySchema>;
