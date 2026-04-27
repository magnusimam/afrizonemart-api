import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  AdminReviewListQuery,
  UpdateReviewBody,
} from './admin.schema';

export async function adminListReviews(query: AdminReviewListQuery) {
  const where: Prisma.ReviewWhereInput = {};
  if (query.productId) where.productId = query.productId;
  if (query.rating) where.rating = query.rating;
  if (query.verified !== undefined) where.verified = query.verified;

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { product: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.review.count({ where }),
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

async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      rating: agg._avg.rating ?? 0,
      reviewCount: agg._count._all,
    },
  });
}

export async function adminUpdateReview(id: string, body: UpdateReviewBody) {
  const existing = await prisma.review.findUnique({ where: { id }, select: { productId: true } });
  if (!existing) throw HttpError.notFound('Review not found');

  const updated = await prisma.review.update({
    where: { id },
    data: {
      ...(body.verified !== undefined && { verified: body.verified }),
      ...(body.title !== undefined && { title: body.title ?? null }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.rating !== undefined && { rating: body.rating }),
    },
    include: { product: { select: { id: true, slug: true, name: true } } },
  });

  if (body.rating !== undefined) {
    await recomputeProductRating(existing.productId);
  }
  return updated;
}

export async function adminDeleteReview(id: string): Promise<void> {
  const existing = await prisma.review.findUnique({ where: { id }, select: { productId: true } });
  if (!existing) throw HttpError.notFound('Review not found');
  await prisma.review.delete({ where: { id } });
  await recomputeProductRating(existing.productId);
}
