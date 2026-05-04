import { z } from 'zod';
import { SECTION_TYPES } from './section-types';

/// Slug rules: lowercase letters, digits, hyphens, with single slashes
/// allowed for nested URLs ("shop/groceries"). No leading/trailing
/// slash, no double slash. Keep concise so admins can type them.
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/,
    'Slug uses lowercase letters, digits, hyphens, and single slashes for nesting',
  );

const accentColorSchema = z
  .string()
  .trim()
  .regex(
    /^(#[0-9a-fA-F]{6}|navy|amber|success|danger|info|charcoal|muted)$/,
    'Accent color must be a hex value or one of: navy, amber, success, danger, info, charcoal, muted',
  )
  .nullish();

export const upsertPageBodySchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullish(),
});
export type UpsertPageBody = z.infer<typeof upsertPageBodySchema>;

export const partialPageBodySchema = upsertPageBodySchema.partial();
export type PartialPageBody = z.infer<typeof partialPageBodySchema>;

export const upsertSectionBodySchema = z.object({
  type: z.enum(SECTION_TYPES as unknown as [string, ...string[]]),
  position: z.number().int().min(0).optional(),
  visible: z.boolean().optional(),
  headline: z.string().trim().max(200).nullish(),
  subheadline: z.string().trim().max(400).nullish(),
  accentColor: accentColorSchema,
  /// Type-specific config — validated downstream against the matching
  /// section-type schema. Kept loose here so we don't double-parse.
  config: z.unknown().default({}),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  countries: z.array(z.string().length(2).toUpperCase()).default([]),
});
export type UpsertSectionBody = z.infer<typeof upsertSectionBodySchema>;

export const partialSectionBodySchema = upsertSectionBodySchema.partial();
export type PartialSectionBody = z.infer<typeof partialSectionBodySchema>;

export const reorderSectionsBodySchema = z.object({
  /// Section IDs in the new order. Position is set to the array index.
  ids: z.array(z.string().min(1)).min(1),
});
export type ReorderSectionsBody = z.infer<typeof reorderSectionsBodySchema>;

export const publishPageBodySchema = z.object({
  /// Optional commit-message-style note on the new revision.
  note: z.string().trim().max(280).nullish(),
});
export type PublishPageBody = z.infer<typeof publishPageBodySchema>;

export const revertToRevisionBodySchema = z.object({
  revisionId: z.string().min(1),
});
export type RevertToRevisionBody = z.infer<typeof revertToRevisionBodySchema>;
