import { eventBus } from '@/infra/eventBus';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { computeDiscount, evaluateCoupon } from '@/modules/coupons/evaluator';
import {
  clearCartItems,
  createCartItems,
  ensureCart,
  findCartByUserId,
  setCartCoupon,
  touchCart,
} from './repository';
import type { ReplaceCartBody } from './cart.schema';

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  price: number;
  comparePrice: number | null;
  image: string | null;
  origin: string | null;
  quantity: number;
  lineTotal: number;
  inStock: boolean;
}

export interface CartView {
  items: CartLine[];
  subtotal: number;
  itemCount: number;
  couponCode: string | null;
  couponDiscount: number;
  couponFreeShipping: boolean;
}

type LoadedCart = NonNullable<Awaited<ReturnType<typeof findCartByUserId>>>;

function shape(cart: LoadedCart | null): CartView {
  const items: CartLine[] = (cart?.items ?? []).map((i) => ({
    productId: i.productId,
    slug: i.product.slug,
    name: i.product.name,
    price: i.product.price,
    comparePrice: i.product.comparePrice,
    image: i.product.images[0] ?? null,
    origin: i.product.origin,
    quantity: i.quantity,
    lineTotal: i.product.price * i.quantity,
    inStock: i.product.inStock,
  }));
  const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);

  let couponCode: string | null = null;
  let couponDiscount = 0;
  let couponFreeShipping = false;
  if (cart?.coupon) {
    // Re-compute discount against current subtotal — never trust a
    // stored value, because cart contents may have changed since
    // the coupon was applied.
    const evalResult = computeDiscount(cart.coupon, subtotal);
    couponCode = cart.coupon.code;
    couponDiscount = evalResult.cartDiscount;
    couponFreeShipping = evalResult.freeShipping;
  }

  return {
    items,
    subtotal,
    itemCount: items.reduce((sum, l) => sum + l.quantity, 0),
    couponCode,
    couponDiscount,
    couponFreeShipping,
  };
}

export async function getCart(userId: string): Promise<CartView> {
  return shape(await findCartByUserId(userId));
}

/**
 * Replace the user's cart with the given items. Validates that every
 * productId exists in the catalog before writing.
 */
export async function replaceCart(
  userId: string,
  body: ReplaceCartBody,
): Promise<CartView> {
  const productIds = [...new Set(body.items.map((i) => i.productId))];
  if (productIds.length > 0) {
    const found = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((p) => p.id));
    const missing = productIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw HttpError.badRequest(
        `Unknown product IDs in cart: ${missing.join(', ')}`,
      );
    }
  }

  const cartId = await ensureCart(userId);
  await clearCartItems(cartId);
  await createCartItems(cartId, body.items);
  await touchCart(cartId);

  await eventBus.emit('cart.updated', {
    userId,
    itemCount: body.items.reduce((sum, i) => sum + i.quantity, 0),
  });

  return getCart(userId);
}

export async function clearCart(userId: string): Promise<CartView> {
  const cart = await findCartByUserId(userId);
  if (cart) {
    await clearCartItems(cart.id);
    await setCartCoupon(userId, null);
    await touchCart(cart.id);
    await eventBus.emit('cart.updated', { userId, itemCount: 0 });
  }
  return {
    items: [],
    subtotal: 0,
    itemCount: 0,
    couponCode: null,
    couponDiscount: 0,
    couponFreeShipping: false,
  };
}

export async function applyCouponToCart(userId: string, code: string): Promise<CartView> {
  const cart = await findCartByUserId(userId);
  if (!cart || cart.items.length === 0) {
    throw HttpError.badRequest('Add items to your cart before applying a coupon.');
  }
  const subtotal = cart.items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const evalResult = await evaluateCoupon({ code, userId, subtotal });
  await setCartCoupon(userId, evalResult.coupon.id);
  return getCart(userId);
}

export async function removeCouponFromCart(userId: string): Promise<CartView> {
  await ensureCart(userId);
  await setCartCoupon(userId, null);
  return getCart(userId);
}
