import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { prisma } from '@/infra/prisma';

export const categoryRoutes = Router();

interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  parentId: string | null;
  productCount: number;
  children: PublicCategory[];
}

/** Public list of categories — used by the storefront's "All Categories"
 *  dropdown, the homepage shelves, and any future menu surface. Returns
 *  a tree (top-level entries with their direct children nested), since
 *  navigation needs the structure but flat consumers can flatten via
 *  the included `parentId`. Product counts include only direct products
 *  (subcategory products aren't rolled up — keep counts truthful per
 *  node so empty subcategories can be hidden at render time). */
categoryRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        image: true,
        parentId: true,
        _count: { select: { products: true } },
      },
    });

    const byId = new Map<string, PublicCategory>();
    for (const c of items) {
      byId.set(c.id, {
        id: c.id,
        slug: c.slug,
        name: c.name,
        image: c.image,
        parentId: c.parentId,
        productCount: c._count.products,
        children: [],
      });
    }
    const tree: PublicCategory[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        tree.push(node);
      }
    }

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({ items: tree });
  }),
);
