import { z } from 'zod';

/**
 * Civic Library — free government document downloads.
 *
 * Validation mirrors `modules/blog/schema.ts` (closest existing
 * DRAFT/PUBLISHED content shape) for the admin CRUD surface.
 */

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug uses lowercase letters, digits, and hyphens');

const DOC_TYPES = [
  'CONSTITUTION',
  'ACT',
  'BILL',
  'POLICY',
  'REGULATION',
  'TREATY',
  'OTHER',
] as const;

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  country: z.string().length(2).optional(),
  docType: z.enum(DOC_TYPES).optional(),
  q: z.string().trim().min(1).max(160).optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

const baseDocumentBodySchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  country: z.string().length(2),
  docType: z.enum(DOC_TYPES),
  /// Required when docType is OTHER — the label the dropdown didn't have.
  customDocType: z.string().trim().min(1).max(60).nullish(),
  description: z.string().trim().max(4000).nullish(),
  issuingBody: z.string().trim().max(200).nullish(),
  officialSourceUrl: z.string().url().nullish(),
  publishedDate: z.string().datetime().nullish(),
  coverImageUrl: z.string().url().nullish(),
  fileUrl: z.string().url(),
  fileSizeBytes: z.number().int().nonnegative().nullish(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

const requireCustomDocType = <T extends { docType: string; customDocType?: string | null }>(
  b: T,
) => b.docType !== 'OTHER' || Boolean(b.customDocType?.trim());

export const upsertDocumentBodySchema = baseDocumentBodySchema.refine(requireCustomDocType, {
  message: 'customDocType is required when docType is OTHER',
  path: ['customDocType'],
});
export type UpsertDocumentBody = z.infer<typeof upsertDocumentBodySchema>;

// Partial only enforces the OTHER/customDocType pairing when the caller
// actually sends docType in this request — a PATCH that leaves docType
// untouched shouldn't be blocked by a customDocType it didn't send.
export const partialDocumentBodySchema = baseDocumentBodySchema
  .partial()
  .refine((b) => b.docType === undefined || requireCustomDocType({ ...b, docType: b.docType }), {
    message: 'customDocType is required when docType is OTHER',
    path: ['customDocType'],
  });
export type PartialDocumentBody = z.infer<typeof partialDocumentBodySchema>;

export const adminListDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ALL']).default('ALL'),
  country: z.string().length(2).optional(),
  docType: z.enum(DOC_TYPES).optional(),
  q: z.string().trim().min(1).max(160).optional(),
});
export type AdminListDocumentsQuery = z.infer<typeof adminListDocumentsQuerySchema>;
