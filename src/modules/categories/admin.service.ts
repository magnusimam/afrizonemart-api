import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { PartialCategoryBody, UpsertCategoryBody } from './admin.schema';

export async function adminListCategories() {
  const items = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return { items };
}

export async function adminCreateCategory(body: UpsertCategoryBody) {
  const existing = await prisma.category.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });
  if (existing) throw HttpError.conflict(`Slug "${body.slug}" already exists`);

  return prisma.category.create({
    data: {
      slug: body.slug,
      name: body.name,
      image: body.image ?? null,
    },
  });
}

export async function adminUpdateCategory(id: string, body: PartialCategoryBody) {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw HttpError.notFound('Category not found');

  if (body.slug) {
    const slugClash = await prisma.category.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (slugClash) throw HttpError.conflict(`Slug "${body.slug}" already in use`);
  }

  return prisma.category.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.name !== undefined && { name: body.name }),
      ...(body.image !== undefined && { image: body.image ?? null }),
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
  await prisma.category.delete({ where: { id } });
}
