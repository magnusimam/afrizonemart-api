import { z } from 'zod';

/**
 * Validation for the intern full-product submission flow.
 *
 * The draft body mirrors the admin product editor's
 * `upsertProductBodySchema` but every field except name + price is
 * optional so an intern can save progress and submit later. The
 * stricter "ready to publish" checks (slug uniqueness, category
 * exists) run at APPROVAL time, not draft time — interns shouldn't
 * be blocked from saving a work-in-progress.
 */

/// Lowercase-hyphen slug, optional — auto-derived from name when blank.
const slugField = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')
  .max(120)
  .optional();

export const upsertProductSubmissionBodySchema = z.object({
  name: z.string().trim().min(1).max(240),
  slug: slugField,
  brand: z.string().trim().max(120).nullish(),
  shortDescription: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(20000).nullish(),
  ingredients: z.string().trim().max(4000).nullish(),
  price: z.number().int().nonnegative(),
  comparePrice: z.number().int().nonnegative().nullish(),
  origin: z.string().length(2).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  images: z.array(z.string()).max(20).default([]),
  /// Bundles / custom fields / specs — same JSON shape as
  /// Product.attributes. Validated against CustomFieldDefs at approval.
  attributes: z.record(z.string(), z.unknown()).default({}),
  categorySlug: z.string().trim().min(1).max(120).nullish(),
});
export type UpsertProductSubmissionBody = z.infer<typeof upsertProductSubmissionBodySchema>;

/// Partial — used by the intern edit endpoint to patch a draft.
export const patchProductSubmissionBodySchema =
  upsertProductSubmissionBodySchema.partial();
export type PatchProductSubmissionBody = z.infer<typeof patchProductSubmissionBodySchema>;

/// Admin review action — approve publishes, reject needs a reason.
export const reviewProductSubmissionBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export type ReviewProductSubmissionBody = z.infer<typeof reviewProductSubmissionBodySchema>;

/// Admin list filter.
export const listProductSubmissionsQuerySchema = z.object({
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(),
  internId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type ListProductSubmissionsQuery = z.infer<typeof listProductSubmissionsQuerySchema>;
