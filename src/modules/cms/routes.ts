import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

export const cmsRoutes = Router();

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
