import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';

export const categoryRoutes = Router();

/** Public list of all categories — used by the storefront's
 *  "All Categories" dropdown in the header, the homepage shelves,
 *  and any future menu surface. Includes product counts so we can
 *  hide empty categories at render time. */
categoryRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        image: true,
        _count: { select: { products: true } },
      },
    });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({
      items: items.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        image: c.image,
        productCount: c._count.products,
      })),
    });
  }),
);
