import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

export const cmsRoutes = Router();

/** Public list of every published CMS page — used by the storefront's
 *  sitemap to enumerate authored content. Returns slug + title +
 *  updatedAt; the heavy `blocks` JSON is omitted so the response stays
 *  fast and small. */
cmsRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.cmsPage.findMany({
      where: { isPublished: true },
      select: {
        slug: true,
        title: true,
        metaDescription: true,
        publishedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({ items });
  }),
);

cmsRoutes.get(
  '/:slug(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug ?? '';
    const page = await prisma.cmsPage.findFirst({
      where: { slug, isPublished: true },
    });
    if (!page) throw HttpError.notFound('Page not found');
    res.json(page);
  }),
);
