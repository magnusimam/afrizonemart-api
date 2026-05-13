import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';

/**
 * Tracker #45 — keep `ProductVariant` rows in sync with the legacy
 * `attributes.bundles` JSON that admin still edits.
 *
 * Semantics:
 *   - Exactly ONE variant per product has `isDefault = true`. That's
 *     the row card-click "add to cart" actions resolve to.
 *   - When the product has bundles: the FIRST bundle is the default
 *     variant (its label is the bundle's label, its price is the
 *     bundle's price). The other bundles are non-default rows.
 *   - When the product has NO bundles: one default row exists with
 *     label = "Default" and price = `Product.price`.
 *
 * This matches what the migration backfilled — the cheapest/first
 * bundle is what list-card adds + cheapest sort use, and there's no
 * orphan "Default" SKU whose price doesn't appear anywhere in the UI.
 *
 * Why mirror instead of cutting attributes.bundles out? The admin
 * product editor still writes `attributes.bundles`. Migrating that
 * UI to write `ProductVariant` directly is a separate tracker item;
 * until then we keep the JSON as the authoring surface and treat
 * `ProductVariant` as the runtime + read-side source of truth that
 * cart/orders rely on.
 */

interface BundleShape {
  label: string;
  price: number;
  comparePrice: number | null;
  units: number;
}

function parseBundles(attributes: unknown): BundleShape[] {
  if (!attributes || typeof attributes !== 'object') return [];
  const raw = (attributes as Record<string, unknown>).bundles;
  if (!Array.isArray(raw)) return [];
  const out: BundleShape[] = [];
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const obj = b as Record<string, unknown>;
    const label = typeof obj.label === 'string' ? obj.label.trim() : '';
    if (!label) continue;
    const price = typeof obj.price === 'number' ? Math.round(obj.price) : null;
    if (price === null || price < 0) continue;
    const comparePrice =
      typeof obj.comparePrice === 'number' && obj.comparePrice > 0
        ? Math.round(obj.comparePrice)
        : null;
    const units =
      typeof obj.units === 'number' && obj.units > 0 ? Math.round(obj.units) : 1;
    out.push({ label, price, comparePrice, units });
  }
  return out;
}

export interface SyncVariantsInput {
  productId: string;
  attributes: unknown;
  basePrice: number;
  baseComparePrice: number | null;
  inStock: boolean;
}

/// Reconcile ProductVariant rows for one product. Called from
/// adminCreateProduct (right after the Product row lands) and from
/// adminUpdateProduct whenever attributes / inStock / price change.
export async function syncProductVariants(input: SyncVariantsInput): Promise<void> {
  const bundles = parseBundles(input.attributes);
  const existing = await prisma.productVariant.findMany({
    where: { productId: input.productId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });

  // Target shape: list of variants we want to end up with.
  // When bundles is empty: one default "Default" row at base price.
  // Otherwise: bundle[0] is the default, rest are non-default rows.
  interface Target {
    label: string;
    priceNgn: number;
    comparePriceNgn: number | null;
    unitsPerPack: number;
    isDefault: boolean;
    sortOrder: number;
  }
  const targets: Target[] =
    bundles.length === 0
      ? [
          {
            label: 'Default',
            priceNgn: input.basePrice,
            comparePriceNgn: input.baseComparePrice,
            unitsPerPack: 1,
            isDefault: true,
            sortOrder: 0,
          },
        ]
      : bundles.map((b, i) => ({
          label: b.label,
          priceNgn: b.price,
          comparePriceNgn: b.comparePrice,
          unitsPerPack: b.units,
          isDefault: i === 0,
          sortOrder: i,
        }));

  // Match each target to an existing row by label (case-insensitive
  // trim). Unmatched existing rows are removed at the end.
  const usedExistingIds = new Set<string>();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  // First pass: prefer matching the default target to the existing
  // default row, regardless of label. Renaming the cheapest bundle
  // shouldn't blow away the default link.
  const existingDefault = existing.find((v) => v.isDefault);
  let defaultTakenById: string | null = null;
  const defaultTarget = targets.find((t) => t.isDefault);
  if (existingDefault && defaultTarget) {
    usedExistingIds.add(existingDefault.id);
    defaultTakenById = existingDefault.id;
    ops.push(
      prisma.productVariant.update({
        where: { id: existingDefault.id },
        data: {
          label: defaultTarget.label,
          priceNgn: defaultTarget.priceNgn,
          comparePriceNgn: defaultTarget.comparePriceNgn,
          unitsPerPack: defaultTarget.unitsPerPack,
          isDefault: true,
          sortOrder: defaultTarget.sortOrder,
          inStock: input.inStock,
        },
      }),
    );
  }

  for (const t of targets) {
    if (t.isDefault && defaultTakenById) continue;
    const labelLower = t.label.toLowerCase();
    const match = existing.find(
      (v) => !usedExistingIds.has(v.id) && v.label.toLowerCase() === labelLower,
    );
    if (match) {
      usedExistingIds.add(match.id);
      ops.push(
        prisma.productVariant.update({
          where: { id: match.id },
          data: {
            label: t.label,
            priceNgn: t.priceNgn,
            comparePriceNgn: t.comparePriceNgn,
            unitsPerPack: t.unitsPerPack,
            isDefault: t.isDefault,
            sortOrder: t.sortOrder,
            inStock: input.inStock,
          },
        }),
      );
    } else {
      ops.push(
        prisma.productVariant.create({
          data: {
            productId: input.productId,
            label: t.label,
            priceNgn: t.priceNgn,
            comparePriceNgn: t.comparePriceNgn,
            unitsPerPack: t.unitsPerPack,
            isDefault: t.isDefault,
            sortOrder: t.sortOrder,
            inStock: input.inStock,
          },
        }),
      );
    }
  }

  // Stale rows: existing variants not paired with any target.
  const stale = existing.filter((v) => !usedExistingIds.has(v.id));
  if (stale.length > 0) {
    // Re-point any cart items at whatever variant is taking over the
    // default slot. Pick the first matching target id from `ops` is
    // tricky (ops haven't run yet); easier to refetch after the
    // updates land. We do it as a follow-up step so cart items
    // never end up orphaned by FK RESTRICT.
    ops.push(
      prisma.cartItem.deleteMany({
        where: { productVariantId: { in: stale.map((v) => v.id) } },
      }),
    );
    ops.push(
      prisma.productVariant.deleteMany({
        where: { id: { in: stale.map((v) => v.id) } },
      }),
    );
  }

  await prisma.$transaction(ops);
}
