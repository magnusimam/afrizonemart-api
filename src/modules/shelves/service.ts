import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import {
  PLACEMENT_REGISTRY,
  PLACEMENT_GROUP_LABELS,
  REGISTRY_BY_KEY,
  isStaticKey,
  isCmsKey,
} from '@/modules/placements/registry';
import type {
  AdminUpdateShelfInput,
  AdminSetShelfProductsInput,
} from './schema';

/**
 * Phase 10.8 — Shelves service.
 *
 * Maps cleanly onto two storage layers:
 *  - `Shelf` — one row per placement key, holding the container config
 *    (title, rows, cols, enabled).
 *  - `ProductPlacement` — one row per (product, placement) pair, holding
 *    sortOrder + per-product schedule + per-product country scope.
 *
 * The admin shelf-manager works against a single shelf at a time: load
 * everything, edit, save. Set-based replace for the product list keeps
 * the API tiny (one PUT instead of POST/DELETE/PATCH per slot).
 */

/// Default container config used when a shelf row doesn't exist yet —
/// keeps the storefront rendering even if seeding hasn't run. Title and
/// rows × cols are pulled from the registry when set, with a 1 × 6
/// fallback for keys that haven't been customised in the registry.
function defaultShelfFor(key: string) {
  const def = REGISTRY_BY_KEY[key];
  return {
    key,
    title: def?.label ?? humaniseKey(key),
    subtitle: null as string | null,
    rows: def?.defaultRows ?? 1,
    cols: def?.defaultCols ?? 6,
    enabled: true,
  };
}

function humaniseKey(key: string): string {
  if (isCmsKey(key)) return key.slice(4).split('-').join(' ');
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function assertValidKey(key: string): Promise<void> {
  if (isStaticKey(key)) return;
  if (isCmsKey(key)) {
    const slug = key.slice(4);
    const exists = await prisma.cmsPage.findFirst({
      where: { slug, isPublished: true },
      select: { id: true },
    });
    if (exists) return;
  }
  throw HttpError.badRequest(`Unknown shelf key: "${key}"`);
}

/// Read one shelf's container config (auto-creates an in-memory default
/// when no row exists yet — caller can persist via update).
export async function getShelfConfig(key: string) {
  const row = await prisma.shelf.findUnique({ where: { key } });
  if (row) return row;
  return defaultShelfFor(key);
}

/// Public read — returns the shelf config + the products currently
/// pinned to it, ordered by ProductPlacement.sortOrder, optionally
/// scoped by country (matches the placement filter behaviour).
export async function readShelf(key: string, country?: string) {
  const shelf = await getShelfConfig(key);
  if (!shelf.enabled) return { shelf, items: [] as Awaited<ReturnType<typeof loadProducts>> };

  const upperCountry = country?.toUpperCase();
  const now = new Date();
  const placements = await prisma.productPlacement.findMany({
    where: {
      placement: key,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ...(upperCountry
          ? [
              {
                OR: [
                  { countries: { isEmpty: true } },
                  { countries: { has: upperCountry } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { sortOrder: 'asc' },
    select: { productId: true },
  });

  const ids = placements.map((p) => p.productId);
  const limit = Math.max(1, shelf.rows * shelf.cols);
  const items = await loadProducts(ids.slice(0, limit));
  // Re-order to match the placement order; loadProducts may return
  // items in arbitrary DB order.
  const byId = new Map(items.map((p) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  return { shelf, items: ordered };
}

async function loadProducts(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.product.findMany({
    where: { id: { in: ids } },
    include: { category: true },
  });
}

// ===================================================================
// Admin: list / read / update / set products
// ===================================================================

export async function adminListShelves() {
  const rows = await prisma.shelf.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  // Counts per placement key — single grouped query.
  const counts = await prisma.productPlacement.groupBy({
    by: ['placement'],
    _count: { _all: true },
  });
  const countByKey = new Map(counts.map((c) => [c.placement, c._count._all]));

  // Static registry first, then dynamic CMS keys (any cms:<slug> that
  // exists either as a Shelf row or has placements assigned).
  const staticItems = PLACEMENT_REGISTRY.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      group: def.group as string,
      shelf: row ?? defaultShelfFor(def.key),
      productCount: countByKey.get(def.key) ?? 0,
      defaultFallback: def.defaultFallback ?? null,
    };
  });

  const cmsKeys = new Set<string>();
  for (const r of rows) if (isCmsKey(r.key)) cmsKeys.add(r.key);
  for (const c of counts) if (isCmsKey(c.placement)) cmsKeys.add(c.placement);
  const cmsItems = Array.from(cmsKeys)
    .sort()
    .map((key) => ({
      key,
      label: humaniseKey(key),
      description: 'Custom CMS page placement.',
      group: 'cms_pages',
      shelf: byKey.get(key) ?? defaultShelfFor(key),
      productCount: countByKey.get(key) ?? 0,
      defaultFallback: null,
    }));

  return {
    groups: PLACEMENT_GROUP_LABELS,
    items: [...staticItems, ...cmsItems],
  };
}

export async function adminGetShelf(key: string) {
  await assertValidKey(key);
  const shelf = await getShelfConfig(key);
  const def = REGISTRY_BY_KEY[key];
  const placements = await prisma.productPlacement.findMany({
    where: { placement: key },
    orderBy: { sortOrder: 'asc' },
    select: {
      productId: true,
      sortOrder: true,
      startsAt: true,
      endsAt: true,
      countries: true,
    },
  });

  // Hydrate with a thin product summary for the picker UI.
  const ids = placements.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      origin: true,
      images: true,
      price: true,
      inStock: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return {
    shelf,
    defaultFallback: def?.defaultFallback ?? null,
    items: placements.map((p) => ({
      productId: p.productId,
      sortOrder: p.sortOrder,
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
      countries: p.countries,
      product: byId.get(p.productId) ?? null,
    })),
  };
}

export async function adminUpdateShelf(key: string, input: AdminUpdateShelfInput) {
  await assertValidKey(key);
  const seed = defaultShelfFor(key);
  const upserted = await prisma.shelf.upsert({
    where: { key },
    create: {
      key,
      title: input.title ?? seed.title,
      subtitle: input.subtitle ?? null,
      rows: input.rows ?? seed.rows,
      cols: input.cols ?? seed.cols,
      enabled: input.enabled ?? seed.enabled,
    },
    update: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.rows !== undefined ? { rows: input.rows } : {}),
      ...(input.cols !== undefined ? { cols: input.cols } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  return upserted;
}

/// Replaces the full list of products on the shelf in a single
/// transaction. Items are saved in the order received (sortOrder is
/// rewritten to 10, 20, 30… so manual gaps between rows are easy to
/// add later without touching the existing values).
export async function adminSetShelfProducts(
  key: string,
  input: AdminSetShelfProductsInput,
) {
  await assertValidKey(key);

  // Validate productIds exist before we delete anything — rolling back
  // a failed product list would otherwise wipe the shelf.
  const ids = input.items.map((i) => i.productId);
  if (ids.length > 0) {
    const found = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((p) => p.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw HttpError.badRequest(
        `Unknown productId(s): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
      );
    }
    if (new Set(ids).size !== ids.length) {
      throw HttpError.badRequest('Duplicate productId in shelf list');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productPlacement.deleteMany({ where: { placement: key } });
    if (input.items.length > 0) {
      await tx.productPlacement.createMany({
        data: input.items.map((slot, idx) => ({
          productId: slot.productId,
          placement: key,
          // Normalise to 10, 20, 30… so admins can later drop a slot in
          // between two rows by editing one number.
          sortOrder: (idx + 1) * 10,
          startsAt: slot.startsAt ? new Date(slot.startsAt) : null,
          endsAt: slot.endsAt ? new Date(slot.endsAt) : null,
          countries: slot.countries.map((c) => c.toUpperCase()),
        })) satisfies Prisma.ProductPlacementCreateManyInput[],
      });
    }
  });

  return { count: input.items.length };
}

/// Idempotent seeder — writes a Shelf row for every static placement
/// key with the registry-supplied title + rows × cols. Runs on every
/// API boot.
///
/// Two passes:
///  1. Insert any missing keys.
///  2. **Re-sync rows that look unedited** — when `updatedAt` ≈
///     `createdAt` (within 2s of creation), assume an editor hasn't
///     touched the shelf and refresh title/rows/cols from the registry
///     so registry renames propagate without an admin doing busywork.
///     Once an editor saves a shelf in `/admin/shelves`, `updatedAt`
///     diverges from `createdAt` and we leave the row alone.
export async function seedDefaultShelves() {
  const existing = await prisma.shelf.findMany({
    select: { key: true, createdAt: true, updatedAt: true },
  });
  const have = new Map(existing.map((s) => [s.key, s]));

  // Pass 1 — insert missing.
  const toCreate = PLACEMENT_REGISTRY.filter((d) => !have.has(d.key));
  if (toCreate.length > 0) {
    await prisma.shelf.createMany({
      data: toCreate.map((d) => ({
        key: d.key,
        title: d.label,
        subtitle: null,
        rows: d.defaultRows ?? 1,
        cols: d.defaultCols ?? 6,
        enabled: true,
      })),
    });
  }

  // Pass 2 — refresh unedited rows from the registry.
  let refreshed = 0;
  for (const def of PLACEMENT_REGISTRY) {
    const row = have.get(def.key);
    if (!row) continue;
    const drift = Math.abs(row.updatedAt.getTime() - row.createdAt.getTime());
    if (drift > 2000) continue;
    await prisma.shelf.update({
      where: { key: def.key },
      data: {
        title: def.label,
        rows: def.defaultRows ?? 1,
        cols: def.defaultCols ?? 6,
        // Bump updatedAt so subsequent registry edits also propagate
        // up to the next admin save — but allow ≤ 2s drift on the next
        // seed pass too. We do this by setting updatedAt = createdAt
        // explicitly to keep the row in the "unedited" pool.
      },
    });
    // Re-pin updatedAt to createdAt so the row stays in the "unedited"
    // pool and subsequent registry tweaks keep flowing through. As
    // soon as an admin uses the editor, updatedAt advances and we
    // stop overwriting.
    await prisma.$executeRaw`UPDATE "Shelf" SET "updatedAt" = "createdAt" WHERE "key" = ${def.key}`;
    refreshed += 1;
  }

  return { created: toCreate.length, refreshed };
}
