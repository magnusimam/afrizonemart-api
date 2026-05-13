import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { validateAndNormalizeAttributes } from '@/modules/custom-fields/service';
import { setProductPlacements } from '@/modules/placements/service';
import { deleteImagesByUrl } from '@/modules/uploads/cleanup';
import type {
  AdminListQuery,
  PartialProductBody,
  UpsertProductBody,
} from './admin.schema';
import { applyPriceChange } from './pricing.service';
import { syncProductVariants } from './variants';

/// Collect every image URL referenced by a set of product ids
/// across both the Product row itself (images[] + brandImageUrl)
/// and every related ProductImageSubmission's 5 image slots.
/// Used by delete paths for best-effort R2 cleanup.
async function collectProductImageUrls(
  productIds: string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const [products, submissions] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { images: true, brandImageUrl: true },
    }),
    prisma.productImageSubmission.findMany({
      where: { productId: { in: productIds } },
      select: {
        frontImageUrl: true,
        backImageUrl: true,
        sideImageUrl: true,
        brandImageUrl: true,
        additionalImages: true,
      },
    }),
  ]);
  const urls: Array<string | null> = [];
  for (const p of products) {
    urls.push(...p.images);
    urls.push(p.brandImageUrl);
  }
  for (const s of submissions) {
    urls.push(s.frontImageUrl);
    urls.push(s.backImageUrl);
    urls.push(s.sideImageUrl);
    urls.push(s.brandImageUrl);
    urls.push(...s.additionalImages);
  }
  return urls.filter((u): u is string => typeof u === 'string' && u.length > 0);
}

function discountPercent(price: number, comparePrice?: number | null): number | null {
  if (!comparePrice || comparePrice <= price) return null;
  return Math.round(((comparePrice - price) / comparePrice) * 100);
}

async function resolveCategoryId(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const cat = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (!cat) throw HttpError.badRequest(`Unknown category slug: ${slug}`);
  return cat.id;
}

export async function adminListProducts(query: AdminListQuery) {
  const where: Prisma.ProductWhereInput = {};
  if (query.category) where.category = { slug: query.category };
  if (query.origin) where.origin = query.origin;
  if (query.inStock !== undefined) where.inStock = query.inStock;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
      { brand: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sort === 'oldest'
      ? { createdAt: 'asc' }
      : query.sort === 'name-asc'
        ? { name: 'asc' }
        : query.sort === 'price-desc'
          ? { price: 'desc' }
          : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { category: true, _count: { select: { reviews: true } } },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function adminGetProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      reviews: { orderBy: { createdAt: 'desc' } },
      placements: { orderBy: [{ sortOrder: 'asc' }] },
    },
  });
  if (!product) throw HttpError.notFound('Product not found');
  return product;
}

export async function adminCreateProduct(
  body: UpsertProductBody,
  actorId: string | null,
) {
  const existing = await prisma.product.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (existing) throw HttpError.conflict(`Slug "${body.slug}" already exists`);

  const categoryId = await resolveCategoryId(body.categorySlug);

  const attributes = await validateAndNormalizeAttributes('PRODUCT', body.attributes);

  const created = await prisma.product.create({
    data: {
      slug: body.slug,
      name: body.name,
      brand: body.brand ?? null,
      shortDescription: body.shortDescription ?? null,
      description: body.description ?? null,
      ingredients: body.ingredients ?? null,
      price: body.price,
      comparePrice: body.comparePrice ?? null,
      discountPercent: discountPercent(body.price, body.comparePrice ?? null),
      origin: body.origin ?? null,
      weightKg: body.weightKg ?? null,
      inStock: body.inStock,
      rating: body.rating,
      reviewCount: body.reviewCount,
      images: body.images,
      attributes: attributes as Prisma.InputJsonValue,
      categoryId,
    },
    include: { category: true },
  });
  /// Tracker #45 — seed ProductVariant rows (default + bundles).
  /// Done before the price-history row so a brand-new product
  /// always has at least one variant available the moment the
  /// admin page redirects to the edit screen.
  await syncProductVariants({
    productId: created.id,
    attributes,
    basePrice: body.price,
    baseComparePrice: body.comparePrice ?? null,
    inStock: body.inStock,
  });
  // Seed the history with an "opening" row so the audit drawer
  // shows the price the product launched at, not just deltas after
  // first edit. oldPrice stays null — there was no prior value.
  await prisma.productPriceChange.create({
    data: {
      productId: created.id,
      oldPrice: null,
      newPrice: body.price,
      oldComparePrice: null,
      newComparePrice: body.comparePrice ?? null,
      changedById: actorId,
      source: 'MANUAL',
      reason: 'Product created',
    },
  });
  if (body.placements) {
    await setProductPlacements(
      created.id,
      body.placements.map((p) => ({
        placement: p.placement,
        sortOrder: p.sortOrder,
        startsAt: p.startsAt ?? null,
        endsAt: p.endsAt ?? null,
        countries: p.countries,
      })),
    );
  }
  return created;
}

export async function adminUpdateProduct(
  id: string,
  body: PartialProductBody,
  actorId: string | null,
) {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, price: true, comparePrice: true, attributes: true },
  });
  if (!existing) throw HttpError.notFound('Product not found');

  if (body.slug) {
    const slugClash = await prisma.product.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (slugClash) throw HttpError.conflict(`Slug "${body.slug}" already in use`);
  }

  const categoryId =
    body.categorySlug === undefined
      ? undefined
      : await resolveCategoryId(body.categorySlug);

  // Price + comparePrice route through applyPriceChange separately
  // so the audit log captures the change. Other fields update via
  // the normal Product update below. discountPercent is owned by
  // applyPriceChange — never write it from here directly.
  if (body.price !== undefined || body.comparePrice !== undefined) {
    await applyPriceChange(
      id,
      {
        ...(body.price !== undefined && { price: body.price }),
        ...(body.comparePrice !== undefined && {
          comparePrice: body.comparePrice ?? null,
        }),
      },
      { actorId, source: 'MANUAL' },
    );
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.brand !== undefined && { brand: body.brand ?? null }),
      ...(body.shortDescription !== undefined && { shortDescription: body.shortDescription ?? null }),
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.ingredients !== undefined && { ingredients: body.ingredients ?? null }),
      ...(body.origin !== undefined && { origin: body.origin ?? null }),
      ...(body.weightKg !== undefined && { weightKg: body.weightKg ?? null }),
      ...(body.inStock !== undefined && { inStock: body.inStock }),
      ...(body.rating !== undefined && { rating: body.rating }),
      ...(body.reviewCount !== undefined && { reviewCount: body.reviewCount }),
      ...(body.images !== undefined && { images: body.images }),
      ...(body.attributes !== undefined && {
        attributes: (await validateAndNormalizeAttributes(
          'PRODUCT',
          body.attributes,
          existing.attributes as Record<string, unknown>,
        )) as Prisma.InputJsonValue,
      }),
      ...(categoryId !== undefined && { categoryId }),
    },
    include: { category: true },
  });
  if (body.placements !== undefined) {
    await setProductPlacements(
      id,
      body.placements.map((p) => ({
        placement: p.placement,
        sortOrder: p.sortOrder,
        startsAt: p.startsAt ?? null,
        endsAt: p.endsAt ?? null,
        countries: p.countries,
      })),
    );
  }

  /// Tracker #45 — keep ProductVariant rows aligned with the latest
  /// attributes.bundles + price + stock state. Called even when only
  /// inStock changes so the variant's stock toggle mirrors the
  /// product's. applyPriceChange already mirrors the default variant
  /// price separately, but a price+attributes update needs this to
  /// flush bundle variant prices too.
  if (
    body.attributes !== undefined ||
    body.inStock !== undefined ||
    body.price !== undefined ||
    body.comparePrice !== undefined
  ) {
    await syncProductVariants({
      productId: id,
      attributes: updated.attributes,
      basePrice: updated.price,
      baseComparePrice: updated.comparePrice,
      inStock: updated.inStock,
    });
  }

  return updated;
}

export async function adminDeleteProduct(id: string): Promise<void> {
  // Refuse to delete if the product is referenced by orders — historical
  // OrderItems already snapshot product fields, so deletion would orphan
  // the FK. Soft-delete (or product archival) is a v2 concern.
  const orderRef = await prisma.orderItem.findFirst({ where: { productId: id }, select: { id: true } });
  if (orderRef) {
    throw HttpError.conflict(
      'Cannot delete a product that has been ordered. Mark it out-of-stock instead.',
    );
  }
  // Collect every R2 URL we know about BEFORE the cascade nukes the
  // submission rows — once Product is deleted, the join is gone.
  const imageUrls = await collectProductImageUrls([id]);
  await prisma.cartItem.deleteMany({ where: { productId: id } });
  await prisma.review.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
  // Best-effort R2 cleanup. Never throws (see uploads/cleanup.ts).
  // Orphans on R2 failure get swept by the monthly orphan-scan cron.
  void deleteImagesByUrl(imageUrls);
}

export interface BulkActionResult {
  /** Number of products the action was applied to. */
  affected: number;
  /** IDs that were rejected (e.g. delete blocked because the product has
   *  orders) along with the reason. The bulk action otherwise succeeds
   *  for the remaining IDs — partial success is preferable to all-or-
   *  nothing because admins doing big sweeps don't want one stuck row to
   *  block the rest. */
  skipped: Array<{ id: string; reason: string }>;
}

export type BulkAction =
  | { kind: 'delete' }
  | { kind: 'set-in-stock'; value: boolean }
  | { kind: 'set-category'; categorySlug: string | null }
  /// Re-price. `mode` chooses the math: `set` writes a fixed
  /// value to every row, `percent-up` raises every current price
  /// by N%, `percent-down` cuts every current price by N%.
  /// `applyTo` (set mode only) lets the user write only the
  /// price, only the compare-at, or both — defaults to price.
  /// `reason` is optional and surfaces in the audit log.
  | {
      kind: 'reprice';
      mode: 'set' | 'percent-up' | 'percent-down';
      value: number;
      applyTo?: 'price' | 'compare' | 'both';
      reason?: string;
    };

export async function adminBulkProductAction(
  ids: string[],
  action: BulkAction,
  actorId: string | null,
): Promise<BulkActionResult> {
  if (ids.length === 0) return { affected: 0, skipped: [] };

  if (action.kind === 'delete') {
    // Refuse to delete products with order history — same rule as the
    // single-delete path. Surface them as `skipped` so the admin sees
    // exactly which rows didn't go through and can mark them
    // out-of-stock instead.
    const referenced = await prisma.orderItem.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const referencedIds = new Set(referenced.map((r) => r.productId));
    const deletable = ids.filter((id) => !referencedIds.has(id));
    // Same pre-collect-then-delete dance as the single-product path —
    // gather R2 URLs before the cascade so we can sweep them after.
    const imageUrls =
      deletable.length > 0 ? await collectProductImageUrls(deletable) : [];
    if (deletable.length > 0) {
      await prisma.$transaction([
        prisma.cartItem.deleteMany({ where: { productId: { in: deletable } } }),
        prisma.review.deleteMany({ where: { productId: { in: deletable } } }),
        prisma.product.deleteMany({ where: { id: { in: deletable } } }),
      ]);
      // Best-effort R2 cleanup. Fire-and-forget; monthly orphan-scan
      // cron is the safety net for any R2 failures.
      void deleteImagesByUrl(imageUrls);
    }
    return {
      affected: deletable.length,
      skipped: Array.from(referencedIds).map((id) => ({
        id,
        reason: 'Has order history — mark out of stock instead',
      })),
    };
  }

  if (action.kind === 'set-in-stock') {
    const r = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { inStock: action.value },
    });
    return { affected: r.count, skipped: [] };
  }

  if (action.kind === 'reprice') {
    // Re-price is the only bulk action that goes through
    // applyPriceChange() — we need a per-row computation (percent
    // modes vary by current price) and per-row audit rows. A
    // single updateMany would skip both.
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, price: true, comparePrice: true },
    });
    const found = new Set(rows.map((r) => r.id));
    const skipped: BulkActionResult['skipped'] = ids
      .filter((id) => !found.has(id))
      .map((id) => ({ id, reason: 'Product not found' }));

    const applyTo = action.applyTo ?? 'price';
    let affected = 0;
    for (const row of rows) {
      const input = computeRepriceInput(row, action, applyTo);
      if (input === null) {
        skipped.push({ id: row.id, reason: 'No-op for this row' });
        continue;
      }
      try {
        const r = await applyPriceChange(row.id, input, {
          actorId,
          source: 'BULK',
          reason: action.reason ?? null,
        });
        if (!r.noop) affected++;
        else skipped.push({ id: row.id, reason: 'No-op for this row' });
      } catch (err) {
        skipped.push({
          id: row.id,
          reason: err instanceof Error ? err.message : 'Update failed',
        });
      }
    }
    return { affected, skipped };
  }

  // set-category
  const categoryId = await resolveCategoryId(action.categorySlug);
  const r = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { categoryId },
  });
  return { affected: r.count, skipped: [] };
}

/// Server-side preview for the rich "Preview re-price" modal.
/// Computes the new price for each selected id WITHOUT writing —
/// the storefront renders before/after for confirmation, then
/// calls the real bulk endpoint to commit. Reuses the same math
/// as the commit path (`computeRepriceInput`) so what you see is
/// exactly what you'll get.
export interface RepricePreviewItem {
  id: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  oldComparePrice: number | null;
  newComparePrice: number | null;
  noop: boolean;
}

export async function adminBulkRepricePreview(
  ids: string[],
  action: Extract<BulkAction, { kind: 'reprice' }>,
): Promise<{ items: RepricePreviewItem[] }> {
  if (ids.length === 0) return { items: [] };
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, price: true, comparePrice: true },
    orderBy: { name: 'asc' },
  });
  const applyTo = action.applyTo ?? 'price';
  const items: RepricePreviewItem[] = rows.map((row) => {
    const computed = computeRepriceInput(row, action, applyTo);
    const newPrice = computed?.price ?? row.price;
    const newCompare =
      computed?.comparePrice !== undefined
        ? computed.comparePrice
        : row.comparePrice;
    return {
      id: row.id,
      name: row.name,
      oldPrice: row.price,
      newPrice,
      oldComparePrice: row.comparePrice,
      newComparePrice: newCompare,
      noop:
        computed === null ||
        (newPrice === row.price && newCompare === row.comparePrice),
    };
  });
  return { items };
}

/// Compute the `applyPriceChange` input for one row in a bulk
/// reprice operation, or null if nothing should change. Shared
/// between the commit path and the preview endpoint so what the
/// preview shows is exactly what gets written.
function computeRepriceInput(
  row: { price: number; comparePrice: number | null },
  action: Extract<BulkAction, { kind: 'reprice' }>,
  applyTo: 'price' | 'compare' | 'both',
): { price?: number; comparePrice?: number | null } | null {
  if (action.mode === 'set') {
    const target = Math.max(0, Math.round(action.value));
    const out: { price?: number; comparePrice?: number | null } = {};
    if (applyTo !== 'compare') out.price = target;
    if (applyTo !== 'price') out.comparePrice = target === 0 ? null : target;
    return Object.keys(out).length === 0 ? null : out;
  }
  // Percent modes always operate on price; compare-at is left
  // alone. Re-running percent on a discounted product was
  // surprising in admin testing — explicit `set` is the way to
  // touch comparePrice.
  const factor =
    action.mode === 'percent-up'
      ? 1 + action.value / 100
      : 1 - action.value / 100;
  if (!Number.isFinite(factor) || factor < 0) return null;
  const newPrice = Math.max(0, Math.round(row.price * factor));
  if (newPrice === row.price) return null;
  return { price: newPrice };
}
