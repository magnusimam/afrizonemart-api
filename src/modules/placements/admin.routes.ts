import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';
import { PLACEMENT_REGISTRY, PLACEMENT_GROUP_LABELS } from './registry';

export const adminPlacementsRoutes = Router();

/**
 * Returns the placement catalogue the admin form needs:
 *  - the static registry (grouped)
 *  - dynamic CMS-page entries (one per published CMS page)
 *  - group labels
 */
adminPlacementsRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const cmsPages = await prisma.cmsPage.findMany({
      where: { isPublished: true },
      orderBy: { title: 'asc' },
      select: { slug: true, title: true },
    });
    const cmsEntries = cmsPages.map((p) => ({
      key: `cms:${p.slug}`,
      label: `/p/${p.slug} — ${p.title}`,
      description: 'Featured on a custom CMS page.',
      group: 'cms_pages' as const,
    }));
    res.json({
      groups: PLACEMENT_GROUP_LABELS,
      items: [...PLACEMENT_REGISTRY, ...cmsEntries],
    });
  }),
);
