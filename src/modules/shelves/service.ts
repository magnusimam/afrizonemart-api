import { Prisma } from '@prisma/client';
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

/// Parses + validates the `countryRows` JSON column. Returns null when
/// the column is null, missing, or shaped wrong — caller treats null
/// as "use the explicit-picks path instead".
function parseCountryRows(
  raw: unknown,
): Array<{ country: string | null; count: number }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ country: string | null; count: number }> = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const row = r as { country?: unknown; count?: unknown };
    const country =
      typeof row.country === 'string' && row.country.length === 2
        ? row.country.toUpperCase()
        : null;
    const count = typeof row.count === 'number' && row.count > 0 ? Math.floor(row.count) : 0;
    if (count > 0) out.push({ country, count });
  }
  return out.length > 0 ? out : null;
}

/// Public read — returns the shelf config + products to render.
/// Three modes evaluated in this order:
///   1. **Country-rule mode**: when `Shelf.countryRows` is set, the
///      result is the rows concatenated in order — `[ZA × N, NG × M, …]`.
///      Auto-updates as the catalog grows.
///   2. **Category auto-fill mode**: when `Shelf.categoryAutoFill` is
///      non-empty AND no country-rule, fills with the latest in-stock
///      products from those categories (and their subcategories — the
///      leaf-wins rule means products attach to leaves but a parent's
///      auto-fill should include them via category-tree expansion).
///      Phase 11 scalable pattern for category-themed shelves.
///   3. **Pick mode** (default): explicit ProductPlacement rows in
///      sortOrder, scoped by country.
export async function readShelf(key: string, country?: string) {
  const shelf = await getShelfConfig(key);
  if (!shelf.enabled) return { shelf, items: [] as Awaited<ReturnType<typeof loadProducts>> };

  const cap = Math.max(1, shelf.rows * shelf.cols);

  // Mode 1 — country-rule.
  // Read `countryRows` off the row; default-shelf objects (from
  // defaultShelfFor) have no such field, hence the cast.
  const rules = parseCountryRows(
    (shelf as { countryRows?: unknown }).countryRows ?? null,
  );
  if (rules) {
    const items: Awaited<ReturnType<typeof loadProducts>> = [];
    const usedIds = new Set<string>();
    for (const rule of rules) {
      if (items.length >= cap) break;
      const remaining = cap - items.length;
      const take = Math.min(rule.count, remaining);
      const where: Prisma.ProductWhereInput = {
        ...(rule.country ? { origin: rule.country } : {}),
        ...(usedIds.size > 0 ? { id: { notIn: Array.from(usedIds) } } : {}),
      };
      // Prefer products with images; fall back to those without if
      // the country has nothing else.
      const withImages = await prisma.product.findMany({
        where: { ...where, NOT: { images: { isEmpty: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        include: { category: true },
      });
      const need = take - withImages.length;
      let withoutImages: typeof withImages = [];
      if (need > 0) {
        withoutImages = await prisma.product.findMany({
          where: { ...where, images: { isEmpty: true } },
          orderBy: { createdAt: 'desc' },
          take: need,
          include: { category: true },
        });
      }
      for (const p of [...withImages, ...withoutImages]) {
        if (usedIds.has(p.id)) continue;
        usedIds.add(p.id);
        items.push(p);
        if (items.length >= cap) break;
      }
    }
    return { shelf, items };
  }

  // Mode 2 — category auto-fill.
  const categorySlugs = (
    shelf as { categoryAutoFill?: string[] }
  ).categoryAutoFill;
  if (categorySlugs && categorySlugs.length > 0) {
    /// Expand each requested slug to include its subcategories. Products
    /// attach to leaves under the leaf-wins rule, so a request for
    /// "groceries" needs the children too.
    const matchedCats = await prisma.category.findMany({
      where: {
        OR: [
          { slug: { in: categorySlugs } },
          { parent: { slug: { in: categorySlugs } } },
        ],
      },
      select: { id: true },
    });
    const categoryIds = matchedCats.map((c) => c.id);
    if (categoryIds.length === 0) {
      return { shelf, items: [] as Awaited<ReturnType<typeof loadProducts>> };
    }
    const products = await prisma.product.findMany({
      where: {
        categoryId: { in: categoryIds },
        inStock: true,
        /// Prefer products with images; the storefront's
        /// PlacementOrFallbackGrid handles imageless gracefully but
        /// home shelves look better with images.
        NOT: { images: { isEmpty: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: cap,
      include: { category: true },
    });
    return { shelf, items: products };
  }

  // Mode 3 — explicit picks.
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
  const items = await loadProducts(ids.slice(0, cap));
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
  // Normalise countryRows: null/[] → null (clears rule mode); array →
  // strip rows with count <= 0 and uppercase country codes for storage.
  const normalisedRows =
    input.countryRows === undefined
      ? undefined
      : input.countryRows === null
        ? null
        : input.countryRows
            .filter((r) => r.count > 0)
            .map((r) => ({
              country: r.country ? r.country.toUpperCase() : null,
              count: r.count,
            }));
  const rowsForDb =
    normalisedRows === undefined
      ? undefined
      : normalisedRows && normalisedRows.length > 0
        ? (normalisedRows as Prisma.InputJsonValue)
        : Prisma.DbNull;
  /// Phase 11 — categoryAutoFill normalisation: trim + lowercase
  /// each slug. Empty array clears the mode (back to picks).
  const normalisedCategories =
    input.categoryAutoFill === undefined
      ? undefined
      : input.categoryAutoFill.map((s) => s.trim().toLowerCase()).filter(Boolean);

  const upserted = await prisma.shelf.upsert({
    where: { key },
    create: {
      key,
      title: input.title ?? seed.title,
      subtitle: input.subtitle ?? null,
      rows: input.rows ?? seed.rows,
      cols: input.cols ?? seed.cols,
      enabled: input.enabled ?? seed.enabled,
      ...(rowsForDb !== undefined ? { countryRows: rowsForDb } : {}),
      ...(normalisedCategories !== undefined
        ? { categoryAutoFill: normalisedCategories }
        : {}),
    },
    update: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.rows !== undefined ? { rows: input.rows } : {}),
      ...(input.cols !== undefined ? { cols: input.cols } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(rowsForDb !== undefined ? { countryRows: rowsForDb } : {}),
      ...(normalisedCategories !== undefined
        ? { categoryAutoFill: normalisedCategories }
        : {}),
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
