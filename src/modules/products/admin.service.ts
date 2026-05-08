import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { validateAndNormalizeAttributes } from '@/modules/custom-fields/service';
import { setProductPlacements } from '@/modules/placements/service';
import type {
  AdminListQuery,
  PartialProductBody,
  UpsertProductBody,
} from './admin.schema';

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

export async function adminCreateProduct(body: UpsertProductBody) {
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

export async function adminUpdateProduct(id: string, body: PartialProductBody) {
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

  // Recompute discountPercent if either price moved.
  const newPrice = body.price ?? existing.price;
  const newCompare = body.comparePrice === undefined ? existing.comparePrice : body.comparePrice;
  const computedDiscount = discountPercent(newPrice, newCompare);

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.brand !== undefined && { brand: body.brand ?? null }),
      ...(body.shortDescription !== undefined && { shortDescription: body.shortDescription ?? null }),
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.ingredients !== undefined && { ingredients: body.ingredients ?? null }),
      ...(body.price !== undefined && { price: body.price }),
      ...(body.comparePrice !== undefined && { comparePrice: body.comparePrice ?? null }),
      discountPercent: computedDiscount,
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
  await prisma.cartItem.deleteMany({ where: { productId: id } });
  await prisma.review.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
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
  | { kind: 'set-category'; categorySlug: string | null };

export async function adminBulkProductAction(
  ids: string[],
  action: BulkAction,
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
    if (deletable.length > 0) {
      await prisma.$transaction([
        prisma.cartItem.deleteMany({ where: { productId: { in: deletable } } }),
        prisma.review.deleteMany({ where: { productId: { in: deletable } } }),
        prisma.product.deleteMany({ where: { id: { in: deletable } } }),
      ]);
    }
    return {
      affected: deletable.length,
      skipped: [...referencedIds].map((id) => ({
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

  // set-category
  const categoryId = await resolveCategoryId(action.categorySlug);
  const r = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { categoryId },
  });
  return { affected: r.count, skipped: [] };
}
