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

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { category: true },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function findProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      reviews: { orderBy: { createdAt: 'desc' } },
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
