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
import type { ResolvedCartItem } from './repository';
import type { CartItemInput, ReplaceCartBody } from './cart.schema';

export interface CartLine {
  productId: string;
  productVariantId: string;
  variantLabel: string | null;
  bundleLabel: string;
  unitsPerPack: number;
  slug: string;
  name: string;
  price: number;
  comparePrice: number | null;
  image: string | null;
  origin: string | null;
  sellableCountries: string[];
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
  /// Tracker #45 — price now reads from ProductVariant. The product
  /// row still drives display fields (name/slug/images/origin) so the
  /// storefront cart view doesn't need a second fetch.
  const items: CartLine[] = (cart?.items ?? []).map((i) => ({
    productId: i.productId,
    productVariantId: i.productVariantId,
    variantLabel: i.variantLabel,
    bundleLabel: i.productVariant.label,
    unitsPerPack: i.productVariant.unitsPerPack,
    slug: i.product.slug,
    name: i.product.name,
    price: i.productVariant.priceNgn,
    comparePrice: i.productVariant.comparePriceNgn,
    image: i.product.images[0] ?? null,
    origin: i.product.origin,
    sellableCountries: i.product.sellableCountries,
    quantity: i.quantity,
    lineTotal: i.productVariant.priceNgn * i.quantity,
    inStock: i.product.inStock && i.productVariant.inStock,
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

/// Tracker #45 — resolve every incoming cart item to a concrete
/// `ProductVariant` row. Accepts either `productVariantId` (preferred)
/// or `productId` (legacy fallback that picks the product's default
/// variant). Merges duplicate variantIds so the @@unique([cartId,
/// productVariantId]) constraint never trips.
async function resolveItems(input: CartItemInput[]): Promise<ResolvedCartItem[]> {
  if (input.length === 0) return [];

  const variantIds = input
    .map((i) => i.productVariantId)
    .filter((v): v is string => Boolean(v));
  const productIdsForLookup = input
    .filter((i) => !i.productVariantId && i.productId)
    .map((i) => i.productId as string);

  const [variants, defaultVariants] = await Promise.all([
    variantIds.length > 0
      ? prisma.productVariant.findMany({
          where: { id: { in: [...new Set(variantIds)] } },
          select: { id: true, productId: true },
        })
      : Promise.resolve([]),
    productIdsForLookup.length > 0
      ? prisma.productVariant.findMany({
          where: { productId: { in: [...new Set(productIdsForLookup)] } },
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: { id: true, productId: true, isDefault: true, sortOrder: true },
        })
      : Promise.resolve([]),
  ]);

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const defaultByProductId = new Map<string, string>();
  for (const v of defaultVariants) {
    if (!defaultByProductId.has(v.productId)) {
      defaultByProductId.set(v.productId, v.id);
    }
  }

  const resolved = new Map<string, ResolvedCartItem>();
  for (const i of input) {
    let variantId: string | undefined;
    let productId: string | undefined;
    if (i.productVariantId) {
      const v = variantById.get(i.productVariantId);
      if (!v) {
        throw HttpError.badRequest(
          `Cart line references a variant that no longer exists.`,
        );
      }
      variantId = v.id;
      productId = v.productId;
    } else if (i.productId) {
      const fallback = defaultByProductId.get(i.productId);
      if (!fallback) {
        throw HttpError.badRequest(
          `Cart line references a product that no longer exists.`,
        );
      }
      variantId = fallback;
      productId = i.productId;
    }
    if (!variantId || !productId) continue;

    const existing = resolved.get(variantId);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + i.quantity);
      if (!existing.variantLabel && i.variantLabel) {
        existing.variantLabel = i.variantLabel;
      }
    } else {
      resolved.set(variantId, {
        productId,
        productVariantId: variantId,
        variantLabel: i.variantLabel ?? null,
        quantity: Math.min(99, i.quantity),
      });
    }
  }

  return [...resolved.values()];
}

/**
 * Replace the user's cart with the given items. Validates that every
 * variant (or fallback productId) exists in the catalog before writing.
 */
export async function replaceCart(
  userId: string,
  body: ReplaceCartBody,
): Promise<CartView> {
  const items = await resolveItems(body.items);

  const cartId = await ensureCart(userId);
  await clearCartItems(cartId);
  await createCartItems(cartId, items);
  await touchCart(cartId);

  await eventBus.emit('cart.updated', {
    userId,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
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
  const subtotal = cart.items.reduce(
    (s, i) => s + i.productVariant.priceNgn * i.quantity,
    0,
  );
  const evalResult = await evaluateCoupon({ code, userId, subtotal });
  await setCartCoupon(userId, evalResult.coupon.id);
  return getCart(userId);
}

export async function removeCouponFromCart(userId: string): Promise<CartView> {
  await ensureCart(userId);
  await setCartCoupon(userId, null);
  return getCart(userId);
}
