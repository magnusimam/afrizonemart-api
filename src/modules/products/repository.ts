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

  if (query.category) where.category = { slug: query.category };
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
