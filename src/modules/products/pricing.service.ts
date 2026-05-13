import type { Prisma, PriceChangeSource } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Price-management foundation.
 *
 * `applyPriceChange()` is the ONLY function that mutates
 * `Product.price` / `Product.comparePrice`. Every entry point
 * — inline edit on /admin/products, bulk re-price (PR 2), CSV
 * import (PR 3), scheduled flip (PR 4), the full /admin/products/[id]
 * editor, and "revert from history" actions — must route through
 * this so the audit log stays complete.
 *
 * Why a dedicated helper instead of inlining the audit write:
 *  - The audit row and the price update must succeed together or
 *    not at all — wrapped in `prisma.$transaction` here.
 *  - `discountPercent` is derived from (price, comparePrice) and
 *    needs to recompute on every change. One place to keep that
 *    in sync.
 *  - No-op detection: if the incoming values match what's already
 *    on the row, we skip the audit insert. Otherwise an admin
 *    submitting the same price twice would pollute the history.
 */

export interface ApplyPriceChangeInput {
  /// New price in NGN whole units. Optional — if undefined the
  /// existing value is kept.
  price?: number;
  /// New compare-at price (the strike-through "was X" anchor).
  /// Pass `null` to clear, undefined to leave unchanged.
  comparePrice?: number | null;
}

export interface ApplyPriceChangeOptions {
  /// User triggering the change. Null is only valid for the
  /// `SCHEDULED` source — every other path must pass an actor.
  actorId: string | null;
  source: PriceChangeSource;
  /// Optional free-form note ("Q3 supplier price hike",
  /// "Black Friday opening price"). Surfaces in the history
  /// drawer.
  reason?: string | null;
}

export interface ApplyPriceChangeResult {
  productId: string;
  oldPrice: number;
  newPrice: number;
  oldComparePrice: number | null;
  newComparePrice: number | null;
  discountPercent: number | null;
  /// True when nothing actually changed — caller can skip toast,
  /// avoid invalidating caches, etc.
  noop: boolean;
}

function discountPercent(price: number, compare: number | null): number | null {
  if (compare == null || compare <= price) return null;
  return Math.round(((compare - price) / compare) * 100);
}

export async function applyPriceChange(
  productId: string,
  input: ApplyPriceChangeInput,
  opts: ApplyPriceChangeOptions,
): Promise<ApplyPriceChangeResult> {
  if (input.price === undefined && input.comparePrice === undefined) {
    throw HttpError.badRequest(
      'applyPriceChange called with neither price nor comparePrice.',
    );
  }
  if (input.price !== undefined && input.price < 0) {
    throw HttpError.badRequest('Price cannot be negative.');
  }
  if (
    input.comparePrice !== undefined &&
    input.comparePrice !== null &&
    input.comparePrice < 0
  ) {
    throw HttpError.badRequest('Compare-at price cannot be negative.');
  }
  if (opts.source !== 'SCHEDULED' && !opts.actorId) {
    // Defensive: every human-initiated source needs an actor for
    // the audit log to mean anything. Only the cron is exempt.
    throw HttpError.badRequest(
      'Price changes must include an actor (only SCHEDULED is exempt).',
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, price: true, comparePrice: true },
    });
    if (!existing) throw HttpError.notFound('Product not found.');

    const nextPrice = input.price ?? existing.price;
    const nextCompare =
      input.comparePrice === undefined ? existing.comparePrice : input.comparePrice;

    // No-op short-circuit. Skip the audit insert and the update.
    if (
      nextPrice === existing.price &&
      nextCompare === existing.comparePrice
    ) {
      return {
        productId,
        oldPrice: existing.price,
        newPrice: existing.price,
        oldComparePrice: existing.comparePrice,
        newComparePrice: existing.comparePrice,
        discountPercent: discountPercent(existing.price, existing.comparePrice),
        noop: true,
      };
    }

    const computedDiscount = discountPercent(nextPrice, nextCompare);

    const data: Prisma.ProductUpdateInput = {
      price: nextPrice,
      comparePrice: nextCompare,
      discountPercent: computedDiscount,
    };

    await tx.product.update({ where: { id: productId }, data });

    /// Tracker #45 — mirror base-price changes onto the product's
    /// default variant so the cart/order pricing stays accurate. We
    /// only touch the default variant; non-default bundle variants
    /// carry their own prices and are edited via the admin variants
    /// editor (still TODO — covered by the admin work after #45).
    await tx.productVariant.updateMany({
      where: { productId, isDefault: true },
      data: {
        priceNgn: nextPrice,
        comparePriceNgn: nextCompare,
      },
    });

    await tx.productPriceChange.create({
      data: {
        productId,
        oldPrice: existing.price,
        newPrice: nextPrice,
        oldComparePrice: existing.comparePrice,
        newComparePrice: nextCompare,
        changedById: opts.actorId,
        source: opts.source,
        reason: opts.reason ?? null,
      },
    });

    return {
      productId,
      oldPrice: existing.price,
      newPrice: nextPrice,
      oldComparePrice: existing.comparePrice,
      newComparePrice: nextCompare,
      discountPercent: computedDiscount,
      noop: false,
    };
  });
}

/// Reads the most recent N price-change rows for a product, with
/// the actor's name + email joined in so the UI can render
/// "Changed by Magnus on 2026-05-11" without a second round trip.
export async function listPriceHistory(productId: string, limit = 50) {
  const rows = await prisma.productPriceChange.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
    include: {
      changedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    oldPrice: r.oldPrice,
    newPrice: r.newPrice,
    oldComparePrice: r.oldComparePrice,
    newComparePrice: r.newComparePrice,
    source: r.source,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    changedBy: r.changedBy
      ? {
          id: r.changedBy.id,
          name: r.changedBy.name,
          email: r.changedBy.email,
        }
      : null,
  }));
}
