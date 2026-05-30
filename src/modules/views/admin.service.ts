import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { ProductViewsQuery, TopProductsQuery } from './admin.schema';

/**
 * Admin-side reads over the `ProductView` table.
 *
 * Uses raw SQL for the aggregate queries that need distinct counts on
 * related columns (sessionId, userId) — Prisma's `groupBy` doesn't
 * compose those cleanly. Bind parameters keep injection out; aliases
 * are quoted to survive Postgres' case folding.
 */

interface TopProductRow {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  view_count: number;
  unique_sessions: number;
  unique_users: number;
}

interface TopProductsResult {
  items: Array<{
    productId: string;
    slug: string;
    name: string;
    image: string | null;
    viewCount: number;
    uniqueSessions: number;
    uniqueUsers: number;
  }>;
  totalProducts: number;
  totalViews: number;
  rangeDays: number;
  since: string;
}

export async function getTopProductsService(
  q: TopProductsQuery,
): Promise<TopProductsResult> {
  const since = new Date(Date.now() - q.days * 24 * 60 * 60 * 1000);

  /// `images[1]` is Postgres-1-indexed; `Product.images` is a
  /// TEXT[] so position 1 is the first/primary thumb. Coalesced to
  /// NULL when the array is empty so the admin UI can fall back.
  const rows = await prisma.$queryRawUnsafe<TopProductRow[]>(
    `
    SELECT
      p.id,
      p.slug,
      p.name,
      CASE WHEN array_length(p.images, 1) IS NULL THEN NULL ELSE p.images[1] END AS image,
      COUNT(pv.id)::int AS view_count,
      COUNT(DISTINCT pv."sessionId")::int AS unique_sessions,
      COUNT(DISTINCT pv."userId")::int AS unique_users
    FROM "Product" p
    INNER JOIN "ProductView" pv ON pv."productId" = p.id
    WHERE pv."viewedAt" >= $1
    GROUP BY p.id
    ORDER BY view_count DESC, p."createdAt" DESC
    LIMIT $2 OFFSET $3
    `,
    since,
    q.limit,
    q.offset,
  );

  /// Headline totals — let admin see "1,247 views across 184
  /// products this week" without scrolling.
  const totals = await prisma.productView.aggregate({
    where: { viewedAt: { gte: since } },
    _count: { _all: true },
  });
  const uniqueProductRows = await prisma.productView.findMany({
    where: { viewedAt: { gte: since } },
    distinct: ['productId'],
    select: { productId: true },
  });

  return {
    items: rows.map((r) => ({
      productId: r.id,
      slug: r.slug,
      name: r.name,
      image: r.image,
      viewCount: r.view_count,
      uniqueSessions: r.unique_sessions,
      uniqueUsers: r.unique_users,
    })),
    totalProducts: uniqueProductRows.length,
    totalViews: totals._count._all,
    rangeDays: q.days,
    since: since.toISOString(),
  };
}

interface ProductViewsResult {
  product: { id: string; slug: string; name: string; image: string | null };
  rangeDays: number;
  since: string;
  totalViews: number;
  uniqueSessions: number;
  uniqueUsers: number;
  anonymousViews: number;
  dailySeries: Array<{ day: string; views: number }>;
  signedInViewers: Array<{
    userId: string;
    name: string | null;
    email: string;
    views: number;
    lastViewed: string;
  }>;
}

export async function getProductViewsService(
  slug: string,
  q: ProductViewsQuery,
): Promise<ProductViewsResult> {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, images: true },
  });
  if (!product) throw HttpError.notFound('Product not found');

  const since = new Date(Date.now() - q.days * 24 * 60 * 60 * 1000);

  /// Headline counts.
  const [totalViews, uniqueSessions, uniqueUsers, anonymousViews] =
    await Promise.all([
      prisma.productView.count({
        where: { productId: product.id, viewedAt: { gte: since } },
      }),
      prisma.productView
        .findMany({
          where: {
            productId: product.id,
            viewedAt: { gte: since },
            sessionId: { not: null },
          },
          distinct: ['sessionId'],
          select: { sessionId: true },
        })
        .then((rows) => rows.length),
      prisma.productView
        .findMany({
          where: {
            productId: product.id,
            viewedAt: { gte: since },
            userId: { not: null },
          },
          distinct: ['userId'],
          select: { userId: true },
        })
        .then((rows) => rows.length),
      prisma.productView.count({
        where: { productId: product.id, viewedAt: { gte: since }, userId: null },
      }),
    ]);

  /// Daily counts for the chart. Pad missing days client-side; we
  /// only return days that actually had ≥1 view to keep the payload
  /// small.
  const dailyRaw = await prisma.$queryRawUnsafe<
    Array<{ day: Date; views: number }>
  >(
    `
    SELECT DATE("viewedAt") AS day, COUNT(*)::int AS views
    FROM "ProductView"
    WHERE "productId" = $1 AND "viewedAt" >= $2
    GROUP BY day
    ORDER BY day ASC
    `,
    product.id,
    since,
  );

  /// Signed-in viewers — name + email + their view count + most
  /// recent view. Caps at 200 so the admin page doesn't choke.
  const viewers = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string | null;
      email: string;
      views: number;
      last_viewed: Date;
    }>
  >(
    `
    SELECT u.id, u.name, u.email,
           COUNT(pv.id)::int AS views,
           MAX(pv."viewedAt") AS last_viewed
    FROM "ProductView" pv
    INNER JOIN "User" u ON u.id = pv."userId"
    WHERE pv."productId" = $1 AND pv."viewedAt" >= $2
    GROUP BY u.id
    ORDER BY views DESC, last_viewed DESC
    LIMIT 200
    `,
    product.id,
    since,
  );

  return {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0] ?? null,
    },
    rangeDays: q.days,
    since: since.toISOString(),
    totalViews,
    uniqueSessions,
    uniqueUsers,
    anonymousViews,
    dailySeries: dailyRaw.map((d) => ({
      day: d.day.toISOString().slice(0, 10),
      views: d.views,
    })),
    signedInViewers: viewers.map((v) => ({
      userId: v.id,
      name: v.name,
      email: v.email,
      views: v.views,
      lastViewed: v.last_viewed.toISOString(),
    })),
  };
}
