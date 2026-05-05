import { z } from 'zod';

const httpsUrl = z.string().url();
const altText = z.string().trim().max(200).nullable().optional();

export const submitImagesBodySchema = z.object({
  frontImageUrl: httpsUrl,
  backImageUrl: httpsUrl,
  sideImageUrl: httpsUrl,
  /// Brand / company logo. Required by the schema so every approved
  /// submission gives the storefront's "About the brand" section
  /// something to render. Loosen to optional later if it turns out
  /// some categories don't have an obvious brand.
  brandImageUrl: httpsUrl,
  brandImageAlt: altText,
  /// Optional extra images beyond the required three (+ brand).
  additionalImages: z.array(httpsUrl).max(8).default([]),
});
export type SubmitImagesBody = z.infer<typeof submitImagesBodySchema>;

export const claimQueueBodySchema = z.object({
  /// How many products to pull from the unassigned pool. Capped to
  /// stop a single intern from grabbing the whole catalog at once.
  count: z.number().int().min(1).max(50).default(10),
});
export type ClaimQueueBody = z.infer<typeof claimQueueBodySchema>;

// ---- Admin-side ----

export const bulkAssignBodySchema = z.object({
  /// Distinct intern IDs to split the work across. Order matters —
  /// products are dealt round-robin starting from the first id.
  internIds: z.array(z.string().min(1)).min(1).max(20),
  /// "all-unimaged" splits every product without an assignedInternId
  /// AND fewer than 3 images. "all-unassigned" only filters by
  /// assignment (allows products that already have images).
  scope: z.enum(['all-unimaged', 'all-unassigned']).default('all-unimaged'),
  /// Optional pay rate (NGN) snapshotted onto each new submission for
  /// these products. Stored on Product so it carries through to
  /// future submissions; can be overridden per-batch later.
  payRate: z.number().int().min(0).optional(),
});
export type BulkAssignBody = z.infer<typeof bulkAssignBodySchema>;

export const reassignBodySchema = z.object({
  /// Product IDs to reassign. Empty = "all unstarted from fromInternId".
  productIds: z.array(z.string().min(1)).optional(),
  /// Source intern (whose products to take). Required when productIds
  /// is empty.
  fromInternId: z.string().min(1).optional(),
  /// Where to send them. Either a single intern id, or an array (the
  /// API splits round-robin), or null (return to unassigned pool).
  toInternIds: z.array(z.string().min(1)).nullable(),
  /// "unstarted" only — a product with a PENDING_REVIEW or APPROVED
  /// submission won't be moved. "all" = every assigned product. We
  /// default to unstarted because moving in-flight work breaks payment
  /// attribution.
  mode: z.enum(['unstarted', 'all']).default('unstarted'),
});
export type ReassignBody = z.infer<typeof reassignBodySchema>;

export const reviewSubmissionBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(1, 'Rejection reason is required').max(500),
  }),
]);
export type ReviewSubmissionBody = z.infer<typeof reviewSubmissionBodySchema>;
