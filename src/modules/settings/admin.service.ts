import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import {
  REGISTRY_BY_KEY,
  SETTINGS_REGISTRY,
  isKnownKey,
  type SettingDef,
} from './registry';

export interface SettingItem {
  def: SettingDef;
  value: string | number | boolean;
  updatedByUserId: string | null;
  updatedAt: string | null;
}

export interface SettingsView {
  items: SettingItem[];
}

/**
 * Coerce a setting value to its registered type, throwing 400 if the
 * inbound JSON value can't fit. We treat the registry as the contract
 * for stored shape — Prisma's Json column is permissive.
 */
function coerceValue(def: SettingDef, value: unknown): string | number | boolean {
  switch (def.type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      throw HttpError.badRequest(`${def.key} must be a boolean`);
    case 'number':
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      throw HttpError.badRequest(`${def.key} must be a number`);
    case 'string':
    case 'email':
    case 'longtext':
      if (typeof value === 'string') return value;
      throw HttpError.badRequest(`${def.key} must be a string`);
  }
}

export async function adminGetSettings(): Promise<SettingsView> {
  const rows = await prisma.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const items = SETTINGS_REGISTRY.map((def): SettingItem => {
    const stored = byKey.get(def.key);
    return {
      def,
      value: stored ? coerceValue(def, stored.value) : def.defaultValue,
      updatedByUserId: stored?.updatedByUserId ?? null,
      updatedAt: stored?.updatedAt.toISOString() ?? null,
    };
  });
  return { items };
}

export async function adminUpdateSettings(
  patches: Record<string, unknown>,
  actorUserId: string,
): Promise<SettingsView> {
  // Validate every key first — fail the whole batch on the first
  // invalid one instead of half-writing.
  const validated: { key: string; value: string | number | boolean }[] = [];
  for (const [key, raw] of Object.entries(patches)) {
    if (!isKnownKey(key)) {
      throw HttpError.badRequest(`Unknown setting key: ${key}`);
    }
    validated.push({ key, value: coerceValue(REGISTRY_BY_KEY[key], raw) });
  }

  await prisma.$transaction(
    validated.map(({ key, value }) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedByUserId: actorUserId },
        update: { value: value as Prisma.InputJsonValue, updatedByUserId: actorUserId },
      }),
    ),
  );

  return adminGetSettings();
}
