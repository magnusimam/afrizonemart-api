import { prisma } from '@/infra/prisma';

export function findCartByUserId(userId: string) {
  return prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { product: true },
        orderBy: { createdAt: 'asc' },
      },
      coupon: true,
    },
  });
}

export async function ensureCart(userId: string): Promise<string> {
  const existing = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.cart.create({
    data: { userId },
    select: { id: true },
  });
  return created.id;
}

export function clearCartItems(cartId: string) {
  return prisma.cartItem.deleteMany({ where: { cartId } });
}

export function createCartItems(
  cartId: string,
  items: { productId: string; quantity: number }[],
) {
  if (items.length === 0) return Promise.resolve({ count: 0 });
  return prisma.cartItem.createMany({
    data: items.map((i) => ({
      cartId,
      productId: i.productId,
      quantity: i.quantity,
    })),
  });
}

export function setCartCoupon(userId: string, couponId: string | null) {
  return prisma.cart.update({ where: { userId }, data: { couponId } });
}
