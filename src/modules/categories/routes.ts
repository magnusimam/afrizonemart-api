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
 *  a tree (top-level entries with their direct children nested).
 *
 *  `productCount` is **rolled up** — a parent's count includes products
 *  in every subcategory beneath it. Otherwise parents would always
 *  show "0" because the leaf-wins assignment rule means products only
 *  ever attach to subcategories, never their parents. */
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

    // Roll up: parent count = direct + sum of children's direct counts.
    // (Schema enforces 2-level max so we don't need recursion.)
    const directById = new Map(items.map((c) => [c.id, c._count.products]));
    const totalById = new Map<string, number>();
    for (const c of items) totalById.set(c.id, directById.get(c.id) ?? 0);
    for (const c of items) {
      if (c.parentId && totalById.has(c.parentId)) {
        totalById.set(
          c.parentId,
          (totalById.get(c.parentId) ?? 0) + (directById.get(c.id) ?? 0),
        );
      }
    }

    const byId = new Map<string, PublicCategory>();
    for (const c of items) {
      byId.set(c.id, {
        id: c.id,
        slug: c.slug,
        name: c.name,
        image: c.image,
        parentId: c.parentId,
        productCount: totalById.get(c.id) ?? 0,
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
