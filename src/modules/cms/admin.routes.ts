import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

export const adminCmsRoutes = Router();

const idParam = z.object({ id: z.string().min(1) });

const upsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    // Allow nested paths via slashes; no leading/trailing slashes.
    .regex(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/, 'Lowercase letters, numbers, hyphens, slashes'),
  title: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().max(500).nullish(),
  blocks: z.array(z.record(z.string(), z.unknown())).default([]),
  isPublished: z.boolean().default(false),
});

const updateSchema = upsertSchema.partial();

adminCmsRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.cmsPage.findMany({
      orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
    });
    res.json({ items });
  }),
);

adminCmsRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const item = await prisma.cmsPage.findUnique({ where: { id } });
    if (!item) throw HttpError.notFound('Page not found');
    res.json(item);
  }),
);

adminCmsRoutes.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = upsertSchema.parse(req.body);
    const existing = await prisma.cmsPage.findUnique({ where: { slug: body.slug } });
    if (existing) throw HttpError.conflict(`Slug "${body.slug}" already exists.`);
    const row = await prisma.cmsPage.create({
      data: {
        slug: body.slug,
        title: body.title,
        metaDescription: body.metaDescription ?? null,
        blocks: body.blocks as object,
        isPublished: body.isPublished,
        publishedAt: body.isPublished ? new Date() : null,
      },
    });
    res.status(201).json(row);
  }),
);

adminCmsRoutes.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    const body = updateSchema.parse(req.body);
    const existing = await prisma.cmsPage.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('Page not found');
    if (body.slug && body.slug !== existing.slug) {
      const clash = await prisma.cmsPage.findUnique({ where: { slug: body.slug } });
      if (clash) throw HttpError.conflict(`Slug "${body.slug}" already in use.`);
    }
    const willPublish =
      body.isPublished !== undefined && body.isPublished && !existing.isPublished;
    const row = await prisma.cmsPage.update({
      where: { id },
      data: {
        ...(body.slug !== undefined && { slug: body.slug }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.metaDescription !== undefined && {
          metaDescription: body.metaDescription ?? null,
        }),
        ...(body.blocks !== undefined && { blocks: body.blocks as object }),
        ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
        ...(willPublish && { publishedAt: new Date() }),
      },
    });
    res.json(row);
  }),
);

adminCmsRoutes.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = idParam.parse(req.params);
    await prisma.cmsPage.delete({ where: { id } });
    res.status(204).end();
  }),
);
