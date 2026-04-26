import { HttpError } from '@/middleware/error-handler';
import { eventBus } from '@/infra/eventBus';
import { findProductBySlug, findProducts } from './repository';
import type { ListProductsQuery } from './product.schema';

/**
 * Business logic for the Products module.
 *
 * Sits between the controller (which speaks HTTP) and the repository
 * (which speaks Prisma). Anything that's "what the business considers
 * a product look-up to mean" lives here — including emitting events,
 * applying rules, etc.
 */

export async function listProducts(query: ListProductsQuery) {
  const { items, total, page, limit } = await findProducts(query);
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getProductBySlug(slug: string, viewerId?: string) {
  const product = await findProductBySlug(slug);
  if (!product) {
    throw HttpError.notFound(`Product "${slug}" not found`);
  }

  // Side effect via event bus — no inventory/analytics code lives in the
  // products service itself (Principle #5).
  await eventBus.emit('product.viewed', {
    productId: product.id,
    userId: viewerId,
  });

  return product;
}
