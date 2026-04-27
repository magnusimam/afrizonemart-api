import { z } from 'zod';

/**
 * Phase 10.1 — Custom Field Registry.
 *
 * Lets non-devs add new fields to products (later: orders, users) without
 * code changes. The values land in the host model's `attributes` JSON
 * column under `attributes[def.key]`.
 */
export const customFieldScopeEnum = z.enum(['PRODUCT', 'ORDER', 'USER']);
export type CustomFieldScope = z.infer<typeof customFieldScopeEnum>;

export const customFieldTypeEnum = z.enum([
  'TEXT',
  'LONGTEXT',
  'NUMBER',
  'BOOLEAN',
  'URL',
  'VIDEO',
  'IMAGE',
  'SELECT',
  'JSON',
  'RICHTEXT',
]);
export type CustomFieldType = z.infer<typeof customFieldTypeEnum>;

// Keys are stable identifiers — once a field is in use, changing the key
// orphans existing values. Lowercase + underscores enforced.
const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase letters, numbers, underscores; starts with a letter');

const optionsSchema = z.record(z.string(), z.unknown()).default({});

export const createFieldSchema = z.object({
  scope: customFieldScopeEnum,
  key: keySchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  type: customFieldTypeEnum,
  required: z.boolean().default(false),
  sortOrder: z.coerce.number().int().nonnegative().default(100),
  options: optionsSchema,
});
export type CreateFieldInput = z.infer<typeof createFieldSchema>;

export const updateFieldSchema = createFieldSchema
  .omit({ scope: true, key: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });
export type UpdateFieldInput = z.infer<typeof updateFieldSchema>;

export const listFieldsQuerySchema = z.object({
  scope: customFieldScopeEnum.optional(),
  includeInactive: z.coerce.boolean().default(false),
});
export type ListFieldsQuery = z.infer<typeof listFieldsQuerySchema>;
