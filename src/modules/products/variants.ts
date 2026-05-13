import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';

/**
 * Tracker #45 — keep `ProductVariant` rows in sync with the legacy
 * `attributes.bundles` JSON that admin still edits. The strategy:
 *
 *   - One default variant per product, mirroring base price.
 *   - One additional variant per bundle (sortOrder = bundle index).
 *   - When admin removes a bundle, the matching variant is deleted
 *     unless it's currently referenced by an OrderItem (FK SET NULL
 *     keeps history safe).
 *
 * Why mirror instead of cut over fully? The admin product editor
 * still writes `attributes.bundles`. Migrating that UI is a separate
 * tracker item; until then we keep the JSON as the authoring surface
 * and treat `ProductVariant` as the runtime + read-side source of
 * truth that cart/orders rely on.
 */

interface BundleShape {
  label: string;
  price: number;
  comparePrice?: number | null;
  units?: number;
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
/// adminUpdateProduct whenever attributes / inStock / category-driven
/// fields change.
export async function syncProductVariants(input: SyncVariantsInput): Promise<void> {
  const bundles = parseBundles(input.attributes);
  const existing = await prisma.productVariant.findMany({
    where: { productId: input.productId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // Default variant — always present, mirrors base price.
  const existingDefault = existing.find((v) => v.isDefault);
  if (existingDefault) {
    ops.push(
      prisma.productVariant.update({
        where: { id: existingDefault.id },
        data: {
          label: bundles.length === 0 ? 'Default' : existingDefault.label,
          priceNgn: input.basePrice,
          comparePriceNgn: input.baseComparePrice,
          inStock: input.inStock,
          sortOrder: 0,
        },
      }),
    );
  } else {
    ops.push(
      prisma.productVariant.create({
        data: {
          productId: input.productId,
          label: 'Default',
          priceNgn: input.basePrice,
          comparePriceNgn: input.baseComparePrice,
          inStock: input.inStock,
          sortOrder: 0,
          isDefault: true,
          unitsPerPack: 1,
        },
      }),
    );
  }

  // Bundle variants — match by label (case-insensitive trim) so an
  // admin renaming a bundle doesn't leak a stale variant row.
  const nonDefault = existing.filter((v) => !v.isDefault);
  const usedExistingIds = new Set<string>();

  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const labelLower = b.label.toLowerCase();
    const match = nonDefault.find(
      (v) => !usedExistingIds.has(v.id) && v.label.toLowerCase() === labelLower,
    );
    if (match) {
      usedExistingIds.add(match.id);
      ops.push(
        prisma.productVariant.update({
          where: { id: match.id },
          data: {
            label: b.label,
            priceNgn: b.price,
            comparePriceNgn: b.comparePrice ?? null,
            unitsPerPack: b.units ?? 1,
            inStock: input.inStock,
            sortOrder: i + 1,
          },
        }),
      );
    } else {
      ops.push(
        prisma.productVariant.create({
          data: {
            productId: input.productId,
            label: b.label,
            priceNgn: b.price,
            comparePriceNgn: b.comparePrice ?? null,
            unitsPerPack: b.units ?? 1,
            inStock: input.inStock,
            sortOrder: i + 1,
            isDefault: false,
          },
        }),
      );
    }
  }

  // Anything left in nonDefault that we didn't pair gets removed.
  // FK on OrderItem is SET NULL so historical orders stay intact.
  // FK on CartItem is RESTRICT, but the same admin sweep also runs
  // through cartItem cleanup elsewhere if needed; here we just no-op
  // any rows that still have active carts referencing them.
  const stale = nonDefault.filter((v) => !usedExistingIds.has(v.id));
  if (stale.length > 0) {
    // Pull any cart items pointing at stale variants — re-point them
    // at the product's default variant so the customer's cart
    // survives the bundle removal.
    const defaultId =
      existingDefault?.id ?? (await ensureDefaultId(input.productId));
    if (defaultId) {
      ops.push(
        prisma.cartItem.updateMany({
          where: { productVariantId: { in: stale.map((v) => v.id) } },
          data: { productVariantId: defaultId },
        }),
      );
    }
    ops.push(
      prisma.productVariant.deleteMany({
        where: { id: { in: stale.map((v) => v.id) } },
      }),
    );
  }

  await prisma.$transaction(ops);
}

async function ensureDefaultId(productId: string): Promise<string | null> {
  const v = await prisma.productVariant.findFirst({
    where: { productId, isDefault: true },
    select: { id: true },
  });
  return v?.id ?? null;
}
