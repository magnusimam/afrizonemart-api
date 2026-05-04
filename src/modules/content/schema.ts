import { z } from 'zod';

/// Per-slot value validators. Loose by design — the storefront's
/// component-side defaults catch any malformed override, and admins
/// edit through a typed form anyway. We just block obviously-wrong
/// shapes (e.g. an image slot expecting a string array).

const imageWithAltSchema = z.object({
  url: z.string().min(1),
  alt: z.string().min(1, 'Alt text required for accessibility + SEO'),
});

const valueByKindSchema = z.union([
  // text / longText — both store a string
  z.string(),
  // number — integer
  z.number().int(),
  // boolean
  z.boolean(),
  // image (single URL only)
  z.object({ url: z.string().min(1) }),
  // imageWithAlt
  imageWithAltSchema,
  // imageList
  z.array(imageWithAltSchema),
  // null clears the override (revert to component default)
  z.null(),
]);

export const updateContentEntrySchema = z.object({
  key: z.string().regex(/^content\./, 'Slot keys must start with "content."'),
  value: valueByKindSchema,
});
export type UpdateContentEntry = z.infer<typeof updateContentEntrySchema>;

export const updateContentBatchSchema = z.object({
  entries: z.array(updateContentEntrySchema).min(1).max(200),
});
export type UpdateContentBatch = z.infer<typeof updateContentBatchSchema>;
