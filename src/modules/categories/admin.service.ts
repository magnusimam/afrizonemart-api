import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { PartialCategoryBody, UpsertCategoryBody } from './admin.schema';

export async function adminListCategories() {
  // Returns the full flat list — admin UI is responsible for nesting
  // children under their parents using `parentId`. Keeping it flat here
  // means a single round-trip and a stable shape regardless of depth.
  const items = await prisma.category.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  return { items };
}

async function assertValidParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) {
    throw HttpError.badRequest('A category cannot be its own parent');
  }
  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  });
  if (!parent) throw HttpError.badRequest('parentId does not exist');
  // Two-level limit keeps URLs sane (/shop/category/subcategory) and
  // matches the storefront route depth. Lift this if we ever model
  // grand-children.
  if (parent.parentId) {
    throw HttpError.badRequest('Subcategories cannot themselves have subcategories (max depth 2)');
  }
}

export async function adminCreateCategory(body: UpsertCategoryBody) {
  const existing = await prisma.category.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });
  if (existing) throw HttpError.conflict(`Slug "${body.slug}" already exists`);

  await assertValidParent(body.parentId);

  return prisma.category.create({
    data: {
      slug: body.slug,
      name: body.name,
      image: body.image ?? null,
      parentId: body.parentId ?? null,
    },
  });
}

export async function adminUpdateCategory(id: string, body: PartialCategoryBody) {
  const existing = await prisma.category.findUnique({
    where: { id },
    select: { id: true, parentId: true },
  });
  if (!existing) throw HttpError.notFound('Category not found');

  if (body.slug) {
    const slugClash = await prisma.category.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (slugClash) throw HttpError.conflict(`Slug "${body.slug}" already in use`);
  }

  if (body.parentId !== undefined) {
    await assertValidParent(body.parentId, id);
    // If this category has children, it cannot be moved under another
    // parent — that would create a 3-level tree.
    if (body.parentId) {
      const hasChildren = await prisma.category.count({ where: { parentId: id } });
      if (hasChildren > 0) {
        throw HttpError.badRequest(
          'Cannot nest a category that already has subcategories — move or delete its children first',
        );
      }
    }
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.image !== undefined && { image: body.image ?? null }),
      ...(body.parentId !== undefined && { parentId: body.parentId ?? null }),
    },
  });
}

export async function adminDeleteCategory(id: string): Promise<void> {
  const inUse = await prisma.product.count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw HttpError.conflict(
      `Cannot delete: ${inUse} product${inUse === 1 ? ' is' : 's are'} still in this category`,
    );
  }
  // Block delete when subcategories exist — admin should reassign them
  // first. (FK is ON DELETE SET NULL, so otherwise children silently
  // become top-level which is rarely the intent.)
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    throw HttpError.conflict(
      `Cannot delete: ${childCount} subcategor${childCount === 1 ? 'y is' : 'ies are'} nested under this one`,
    );
  }
  await prisma.category.delete({ where: { id } });
}
