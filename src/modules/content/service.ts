import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { isKnownSlot, SITE_CONTENT_SLOTS } from './registry';
import type { UpdateContentBatch } from './schema';

/**
 * Returns a flat map of every content override the admin has set.
 * Keys missing from this map are not "null" — they mean "no override,
 * use the component-side default". Storefront treats undefined values
 * accordingly.
 */
export async function getContentOverrides(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: 'content.' } },
    select: { key: true, value: true },
  });
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/**
 * Batch upsert. Slots not in the registry are silently dropped — this
 * is a hard guard so a typo in the admin form can't pollute the
 * Setting table with orphan rows. A `null` value clears the override.
 */
export async function updateContentOverrides(
  body: UpdateContentBatch,
  authorId: string | null,
): Promise<{ updated: number; skipped: string[]; cleared: number }> {
  const skipped: string[] = [];
  const validEntries = body.entries.filter((e) => {
    if (!isKnownSlot(e.key)) {
      skipped.push(e.key);
      return false;
    }
    return true;
  });

  if (validEntries.length === 0) {
    if (skipped.length > 0) {
      throw HttpError.badRequest(
        `No valid content slots in payload. Unknown keys: ${skipped.join(', ')}`,
      );
    }
    return { updated: 0, skipped, cleared: 0 };
  }

  let updated = 0;
  let cleared = 0;
  await prisma.$transaction(
    validEntries.map((e) => {
      if (e.value === null) {
        cleared++;
        // Soft delete — actually drop the row so the storefront sees
        // no override at all (cleaner than storing JSON null).
        return prisma.setting.deleteMany({ where: { key: e.key } });
      }
      updated++;
      return prisma.setting.upsert({
        where: { key: e.key },
        update: {
          value: e.value as Prisma.InputJsonValue,
          updatedByUserId: authorId,
        },
        create: {
          key: e.key,
          value: e.value as Prisma.InputJsonValue,
          updatedByUserId: authorId,
        },
      });
    }),
  );

  return { updated, skipped, cleared };
}

/**
 * Returns the slot registry — used by the admin form to render the
 * right input for each slot. Defined in code (not the DB) so it stays
 * trustworthy.
 */
export function getRegistry() {
  return { slots: SITE_CONTENT_SLOTS };
}
