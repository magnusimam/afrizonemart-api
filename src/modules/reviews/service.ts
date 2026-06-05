import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { CreateReviewBody, ListReviewsQuery } from './schema';

/// Transaction client shape — extracted from the EXTENDED prisma
/// instance's `$transaction` callback so the type matches whatever
/// extensions are layered on. Plain `Prisma.TransactionClient`
/// doesn't match the extended shape. Pattern stolen from
/// `loyalty/service.ts`.
type AppTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Public reviews service — customer list + create.
 *
 * Admin moderation lives in `admin.service.ts` (already wired) and
 * has its own recompute helper. We mirror the recompute here on
 * create so `Product.rating` + `reviewCount` (which power the
 * AggregateRating in the product JSON-LD → star rich snippet) stay
 * in lockstep with the actual review data.
 *
 * Verified flag: auto-set if the author has any non-cancelled,
 * non-pending order containing the product. Snapshotted at create
 * time. Refunded orders still count — they took delivery enough to
 * form an opinion.
 */

const VERIFIED_PURCHASE_STATUSES = ['PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED'] as const;

/// MUST run inside the same transaction as the mutation so concurrent
/// writes settle on a consistent average.
async function recomputeProductRating(
  tx: AppTx,
  productId: string,
): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      rating: agg._avg.rating ?? 0,
      reviewCount: agg._count._all,
    },
  });
}

/// Public shape — strips any internal/PII fields. The product page
/// renders this directly.
function publicReview(r: {
  id: string;
  productId: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  createdAt: Date;
}) {
  return {
    id: r.id,
    productId: r.productId,
    authorName: r.authorName,
    authorCountry: r.authorCountry,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verified: r.verified,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listReviewsForProductService(q: ListReviewsQuery) {
  const product = await prisma.product.findUnique({
    where: { slug: q.productSlug },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound('Product not found');

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId: product.id },
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: q.limit,
    }),
    prisma.review.count({ where: { productId: product.id } }),
  ]);
  return {
    items: items.map(publicReview),
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}

export async function createReviewService(userId: string, body: CreateReviewBody) {
  /// Resolve product (slug → id) + author identity (snapshot from user
  /// so a later name change doesn't rewrite history).
  const [product, user] = await Promise.all([
    prisma.product.findUnique({
      where: { slug: body.productSlug },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
  ]);
  if (!product) throw HttpError.notFound('Product not found');
  if (!user) throw HttpError.unauthorized('Account not found');

  /// Verified-purchase check — separate query to keep the tx light.
  const purchased = await prisma.order.findFirst({
    where: {
      userId,
      status: { in: [...VERIFIED_PURCHASE_STATUSES] },
      items: { some: { productId: product.id } },
    },
    select: { id: true },
  });

  /// Friendly author name. Falls back to the email's local part if
  /// the user never set a name — never expose the full email.
  const authorName =
    user.name?.trim() || user.email.split('@')[0] || 'Anonymous';

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.review.create({
        data: {
          productId: product.id,
          userId,
          authorName,
          authorCountry: null,
          rating: body.rating,
          title: body.title?.trim() || null,
          body: body.body.trim(),
          verified: Boolean(purchased),
        },
      });
      await recomputeProductRating(tx, product.id);
      return row;
    });
    return publicReview(created);
  } catch (err) {
    /// Partial unique index on (userId, productId) — catch the
    /// constraint violation and surface a friendly message
    /// instead of the raw Prisma error. The mobile bulk-rate flow
    /// handles a 409 per-row so other reviews in the same batch
    /// still land.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw HttpError.conflict(
        "You've already reviewed this product. Edit your existing review instead.",
      );
    }
    throw err;
  }
}
