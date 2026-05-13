import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { placementFilter } from '@/modules/placements/service';
import type { ListProductsQuery } from './product.schema';

/**
 * Prisma queries for the Products module.
 *
 * Stays narrow: each function returns the raw DB shape. The service layer
 * (above) shapes responses for the client. The HTTP controller never
 * touches Prisma directly — a hard rule (Principle #6 Separation of
 * Concerns).
 */

export async function findProducts(query: ListProductsQuery) {
  // Phase 10.8 — explicit-id mode. Manual-pick shelves and curated
  // page-builder sections need to fetch a specific list of products in
  // the order the editor arranged them. Other filters (sort, category,
  // placement, country) don't apply here — the caller already decided
  // membership and order. We honour `inStock` so an editor's pick that
  // goes out of stock can be hidden without re-saving the shelf.
  if (query.ids && query.ids.length > 0) {
    const idWhere: Prisma.ProductWhereInput = { id: { in: query.ids } };
    if (query.inStock !== undefined) idWhere.inStock = query.inStock;
    const items = await prisma.product.findMany({
      where: idWhere,
      include: { category: true },
    });
    const byId = new Map(items.map((p) => [p.id, p]));
    const ordered = query.ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    return {
      items: ordered,
      total: ordered.length,
      page: 1,
      limit: ordered.length || 1,
    };
  }

  const where: Prisma.ProductWhereInput = {};

  if (query.category) {
    // Match the requested category AND every descendant (sub-category).
    // Without this, hitting `?category=groceries` returns nothing when
    // products are tagged to children like `carbonated-drinks` or
    // `malt-drinks`. Catalog tree is shallow (≤3 levels) so a single
    // `findMany` over Categories is cheap; we walk it in memory.
    const slugs = await categorySlugWithDescendants(query.category);
    where.category = { slug: { in: slugs } };
  }
  if (query.origin) where.origin = query.origin.toUpperCase();
  if (query.inStock !== undefined) where.inStock = query.inStock;
  if (query.onSale === true) where.comparePrice = { not: null };
  if (query.onSale === false) where.comparePrice = null;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { brand: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.placement) {
    Object.assign(where, placementFilter(query.placement, query.country?.toUpperCase()));
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
    switch (query.sort) {
      case 'newest':
        return { createdAt: 'desc' };
      case 'price-asc':
        return { price: 'asc' };
      case 'price-desc':
        return { price: 'desc' };
      case 'rating':
        return { rating: 'desc' };
      case 'featured':
      default:
        return { createdAt: 'desc' };
    }
  })();

  // Rank products with images above products without images, then
  // apply the requested sort within each group. We do this with two
  // parallel queries (with-images-first / empty-second) and stitch
  // them across the page boundary. Reason: customers shouldn't see
  // empty placeholders before products that already have photos —
  // newly imported SKUs sit at the top of `createdAt DESC` until
  // interns approve images, which made the storefront look broken.
  const skip = (query.page - 1) * query.limit;
  const take = query.limit;

  const withImagesWhere: Prisma.ProductWhereInput = {
    ...where,
    NOT: { images: { isEmpty: true } },
  };
  const withoutImagesWhere: Prisma.ProductWhereInput = {
    ...where,
    images: { isEmpty: true },
  };

  const [withImagesCount, total] = await Promise.all([
    prisma.product.count({ where: withImagesWhere }),
    prisma.product.count({ where }),
  ]);

  const items: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  if (skip < withImagesCount) {
    const takeFromWith = Math.min(take, withImagesCount - skip);
    const withItems = await prisma.product.findMany({
      where: withImagesWhere,
      orderBy,
      skip,
      take: takeFromWith,
      include: { category: true },
    });
    items.push(...withItems);
    const remaining = take - items.length;
    if (remaining > 0) {
      const withoutItems = await prisma.product.findMany({
        where: withoutImagesWhere,
        orderBy,
        skip: 0,
        take: remaining,
        include: { category: true },
      });
      items.push(...withoutItems);
    }
  } else {
    const withoutItems = await prisma.product.findMany({
      where: withoutImagesWhere,
      orderBy,
      skip: skip - withImagesCount,
      take,
      include: { category: true },
    });
    items.push(...withoutItems);
  }

  return { items, total, page: query.page, limit: query.limit };
}

export async function findProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      reviews: { orderBy: { createdAt: 'desc' } },
      /// Tracker #45 — surface real variant IDs to the storefront so
      /// PDP add-to-cart can send a real `productVariantId`.
      variants: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
    },
  });
}

/**
 * Returns the slug + every descendant slug for a given category. If the
 * slug doesn't match any category we return [slug] as-is so the calling
 * query falls through to a normal exact-match (which will yield zero
 * results — caller will surface "no products" rather than 500).
 */
async function categorySlugWithDescendants(slug: string): Promise<string[]> {
  // Single read of the (small) category tree. ~50 rows on a real
  // catalog; the in-memory walk avoids a recursive CTE / multiple
  // round-trips and keeps the function easy to reason about.
  const all = await prisma.category.findMany({
    select: { id: true, slug: true, parentId: true },
  });
  const root = all.find((c) => c.slug === slug);
  if (!root) return [slug];

  const childrenById = new Map<string | null, typeof all>();
  for (const c of all) {
    const arr = childrenById.get(c.parentId) ?? [];
    arr.push(c);
    childrenById.set(c.parentId, arr);
  }

  const slugs: string[] = [root.slug];
  const stack = [root.id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const kids = childrenById.get(id) ?? [];
    for (const k of kids) {
      slugs.push(k.slug);
      stack.push(k.id);
    }
  }
  return slugs;
}
