import { z } from 'zod';

/**
 * Validation for the Civic Library document submission flow — the
 * intern-sourcing pipeline for GovDocument (constitutions, acts,
 * bills, policies). Structurally mirrors
 * `modules/product-submissions/schema.ts`: every field except title
 * is optional at draft time so an intern can save progress; the
 * stricter checks (slug uniqueness) run at APPROVAL time.
 */

const slugField = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')
  .max(120)
  .optional();

const DOC_TYPES = ['CONSTITUTION', 'ACT', 'BILL', 'POLICY', 'REGULATION', 'TREATY'] as const;

export const upsertDocumentSubmissionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slugField,
  country: z.string().length(2),
  docType: z.enum(DOC_TYPES),
  description: z.string().trim().max(4000).nullish(),
  issuingBody: z.string().trim().max(200).nullish(),
  officialSourceUrl: z.string().url().nullish(),
  publishedDate: z.string().datetime().nullish(),
  fileUrl: z.string().url(),
  fileSizeBytes: z.number().int().nonnegative().nullish(),
});
export type UpsertDocumentSubmissionBody = z.infer<typeof upsertDocumentSubmissionBodySchema>;

/// Partial — used by the intern edit endpoint to patch a draft.
export const patchDocumentSubmissionBodySchema = upsertDocumentSubmissionBodySchema.partial();
export type PatchDocumentSubmissionBody = z.infer<typeof patchDocumentSubmissionBodySchema>;

/// Admin review action — approve publishes, reject needs a reason.
export const reviewDocumentSubmissionBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export type ReviewDocumentSubmissionBody = z.infer<typeof reviewDocumentSubmissionBodySchema>;

/// Admin list filter.
export const listDocumentSubmissionsQuerySchema = z.object({
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(),
  internId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ListDocumentSubmissionsQuery = z.infer<typeof listDocumentSubmissionsQuerySchema>;
