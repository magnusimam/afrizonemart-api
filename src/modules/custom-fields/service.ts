import type { CustomFieldDef, CustomFieldType, Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  CreateFieldInput,
  CustomFieldScope,
  ListFieldsQuery,
  UpdateFieldInput,
} from './schema';

/**
 * Read-side helper: returns the active field defs for a scope, sorted by
 * sortOrder. Used by the host module (e.g. products) to validate writes
 * and by the storefront/admin to render fields dynamically.
 *
 * Cached at process level for a few seconds — the registry is small,
 * read-heavy, and changes through the admin UI which can bust the cache.
 */
const cache = new Map<string, { value: CustomFieldDef[]; expires: number }>();
const CACHE_MS = 30_000;

export async function getActiveFields(scope: CustomFieldScope): Promise<CustomFieldDef[]> {
  const hit = cache.get(scope);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await prisma.customFieldDef.findMany({
    where: { scope, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  cache.set(scope, { value, expires: Date.now() + CACHE_MS });
  return value;
}

function invalidate(scope: CustomFieldScope): void {
  cache.delete(scope);
}

export async function listFields(query: ListFieldsQuery) {
  const where: Prisma.CustomFieldDefWhereInput = {};
  if (query.scope) where.scope = query.scope;
  if (!query.includeInactive) where.isActive = true;
  return prisma.customFieldDef.findMany({
    where,
    orderBy: [{ scope: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createField(input: CreateFieldInput) {
  const existing = await prisma.customFieldDef.findUnique({
    where: { scope_key: { scope: input.scope, key: input.key } },
  });
  if (existing) {
    throw HttpError.conflict(
      `A ${input.scope.toLowerCase()} field with key "${input.key}" already exists.`,
    );
  }
  validateOptions(input.type, input.options);

  const def = await prisma.customFieldDef.create({
    data: {
      scope: input.scope,
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      type: input.type,
      required: input.required,
      sortOrder: input.sortOrder,
      options: input.options as Prisma.InputJsonValue,
    },
  });
  invalidate(input.scope);
  return def;
}

export async function updateField(id: string, input: UpdateFieldInput) {
  const existing = await prisma.customFieldDef.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Field not found');

  const data: Prisma.CustomFieldDefUpdateInput = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.type !== undefined) data.type = input.type;
  if (input.required !== undefined) data.required = input.required;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.options !== undefined) {
    validateOptions(input.type ?? existing.type, input.options);
    data.options = input.options as Prisma.InputJsonValue;
  }

  const updated = await prisma.customFieldDef.update({ where: { id }, data });
  invalidate(existing.scope);
  return updated;
}

export async function deleteField(id: string) {
  const existing = await prisma.customFieldDef.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Field not found');
  await prisma.customFieldDef.delete({ where: { id } });
  invalidate(existing.scope);
}

/**
 * Validates the registry-defined fields inside an attributes record and
 * returns a merged object: pre-existing keys that aren't owned by the
 * registry are preserved (e.g. legacy `bundles`, `features`, `specs`),
 * while keys that match an active field def are coerced/validated.
 *
 * Throws on hard violations (required missing, wrong type, bad URL).
 *
 * @param scope which entity type the attributes belong to
 * @param raw   the incoming attributes from the client
 * @param previous optional — the existing record's attributes; required-field
 *                 checks pass if the previous record already had a value.
 */
export async function validateAndNormalizeAttributes(
  scope: CustomFieldScope,
  raw: Record<string, unknown>,
  previous?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const defs = await getActiveFields(scope);
  const out: Record<string, unknown> = { ...raw };
  for (const def of defs) {
    const value = raw[def.key];
    const present = value !== undefined && value !== null && value !== '';
    if (!present) {
      const previouslySet =
        previous && previous[def.key] !== undefined && previous[def.key] !== null && previous[def.key] !== '';
      if (def.required && !previouslySet) {
        throw HttpError.badRequest(`Field "${def.label}" is required.`);
      }
      // Strip empty so the row doesn't accumulate empty strings.
      if (value === '' || value === null) delete out[def.key];
      continue;
    }
    out[def.key] = coerce(def.type, value, def.options as Record<string, unknown>);
  }
  return out;
}

// ---------- helpers ----------

function validateOptions(type: CustomFieldType, options: Record<string, unknown>): void {
  if (type === 'SELECT') {
    const choices = options.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw HttpError.badRequest(
        'SELECT fields require options.choices as a non-empty array of strings.',
      );
    }
    if (!choices.every((c) => typeof c === 'string')) {
      throw HttpError.badRequest('SELECT choices must all be strings.');
    }
  }
}

function coerce(
  type: CustomFieldType,
  value: unknown,
  options: Record<string, unknown>,
): unknown {
  switch (type) {
    case 'TEXT':
    case 'LONGTEXT':
    case 'RICHTEXT':
      return String(value);
    case 'NUMBER': {
      const n = Number(value);
      if (Number.isNaN(n)) throw HttpError.badRequest('Expected a number');
      const min = typeof options.min === 'number' ? options.min : undefined;
      const max = typeof options.max === 'number' ? options.max : undefined;
      if (min !== undefined && n < min) {
        throw HttpError.badRequest(`Value below minimum ${min}`);
      }
      if (max !== undefined && n > max) {
        throw HttpError.badRequest(`Value above maximum ${max}`);
      }
      return n;
    }
    case 'BOOLEAN':
      return Boolean(value);
    case 'URL':
    case 'VIDEO':
    case 'IMAGE': {
      const s = String(value);
      try {
        // throws on malformed
        new URL(s);
      } catch {
        throw HttpError.badRequest(`Expected a valid URL, got "${s}"`);
      }
      return s;
    }
    case 'SELECT': {
      const choices = (options.choices as string[]) ?? [];
      const s = String(value);
      if (!choices.includes(s)) {
        throw HttpError.badRequest(
          `Value "${s}" is not one of: ${choices.join(', ')}`,
        );
      }
      return s;
    }
    case 'JSON':
      // Best-effort: if string, try parse; otherwise pass through.
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          throw HttpError.badRequest('Expected valid JSON');
        }
      }
      return value;
  }
}
