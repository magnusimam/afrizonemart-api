import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Wishlist service. CRUD-by-product so the heart toggle on a card
 * doesn't need to know the WishlistItem id.
 *
 *  - `add`     — idempotent: duplicate (userId, productId) is a no-op
 *                instead of a unique-constraint 409. Toggling a heart
 *                from "off" twice in a row should not error.
 *  - `remove`  — idempotent: missing row returns silently.
 *  - `list`    — joins enough of Product to render a wishlist card
 *                without a second round-trip.
 *  - `count`   — cheap header-counter for /account dashboard.
 */

export async function listWishlist(userId: string) {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          price: true,
          comparePrice: true,
          discountPercent: true,
          origin: true,
          inStock: true,
          rating: true,
          reviewCount: true,
          images: true,
        },
      },
    },
  });
  return items.map((row) => ({
    id: row.id,
    addedAt: row.createdAt.toISOString(),
    product: row.product,
  }));
}

export async function countWishlist(userId: string) {
  return prisma.wishlistItem.count({ where: { userId } });
}

export async function addToWishlist(userId: string, productId: string) {
  // Verify the product exists so we don't end up with foreign-key
  // mismatch errors for non-existent ids supplied by the client.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw HttpError.notFound('Product not found.');

  // Idempotent — `upsert` on the (userId, productId) unique key.
  const item = await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return { id: item.id, productId, addedAt: item.createdAt.toISOString() };
}

export async function removeFromWishlist(userId: string, productId: string) {
  await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
}
