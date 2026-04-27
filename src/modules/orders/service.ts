import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { eventBus } from '@/infra/eventBus';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { computeDiscount, evaluateCoupon } from '@/modules/coupons/evaluator';
import { computeShippingCost, getRatesForCountry } from '@/modules/shipping/service';
import { findOrder, findOrdersByUser } from './repository';
import type { PlaceOrderBody } from './order.schema';

function newOrderNumber(): string {
  const code = randomBytes(3).toString('hex').toUpperCase();
  return `AZM-${Date.now().toString(36).toUpperCase()}-${code}`;
}

export async function placeOrder(userId: string, body: PlaceOrderBody) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: { include: { product: true } },
      coupon: true,
    },
  });
  if (!cart || cart.items.length === 0) {
    throw HttpError.badRequest('Cart is empty');
  }

  const oosLine = cart.items.find((i) => !i.product.inStock);
  if (oosLine) {
    throw HttpError.badRequest(
      `"${oosLine.product.name}" is out of stock — please remove it before checkout.`,
    );
  }

  const subtotal = cart.items.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0,
  );

  // ----- Resolve shipping rate -----
  // Either the explicit choice from the body, or the default rate for
  // the matched zone (matched country → catch-all default zone).
  let chosenRate: { id: string; priceAmount: number; freeAboveAmount: number | null } | null = null;
  if (body.shippingRateId) {
    const rate = await prisma.shippingRate.findUnique({
      where: { id: body.shippingRateId },
      select: { id: true, priceAmount: true, freeAboveAmount: true, zone: { select: { countries: true, isDefault: true } } },
    });
    if (!rate) throw HttpError.badRequest('Selected shipping rate no longer exists.');
    // Loosely validate: rate's zone must cover the ship-to country (or be default).
    const country = body.shipping.country.toUpperCase();
    if (!rate.zone.isDefault && !rate.zone.countries.includes(country)) {
      throw HttpError.badRequest(
        `That shipping rate isn't available for ${country}.`,
      );
    }
    chosenRate = { id: rate.id, priceAmount: rate.priceAmount, freeAboveAmount: rate.freeAboveAmount };
  } else {
    const { rates } = await getRatesForCountry(body.shipping.country);
    const fallback = rates.find((r) => r.isDefault) ?? rates[0] ?? null;
    if (fallback) {
      chosenRate = {
        id: fallback.id,
        priceAmount: fallback.priceAmount,
        freeAboveAmount: fallback.freeAboveAmount,
      };
    }
  }

  // ----- Re-validate coupon -----
  // Cart only stores the couponId; we re-evaluate against the current
  // cart state at place-order time so a price change or expiry between
  // apply and place rejects cleanly.
  let couponDiscount = 0;
  let couponCode: string | null = null;
  let couponFreeShipping = false;
  let couponId: string | null = null;
  if (cart.coupon) {
    try {
      const evalResult = await evaluateCoupon({
        code: cart.coupon.code,
        userId,
        subtotal,
      });
      couponDiscount = evalResult.cartDiscount;
      couponCode = evalResult.coupon.code;
      couponFreeShipping = evalResult.freeShipping;
      couponId = evalResult.coupon.id;
    } catch (err) {
      // Surface the rejection to the customer with the same message,
      // and clear the coupon off the cart so they don't keep hitting it.
      await prisma.cart.update({ where: { userId }, data: { couponId: null } });
      throw err;
    }
  }

  const baseShipping = computeShippingCost(chosenRate, subtotal);
  const shippingCost = couponFreeShipping ? 0 : baseShipping;
  const total = Math.max(0, subtotal - couponDiscount + shippingCost);

  // ----- Place the order in one transaction -----
  // Bumped timeout from the 5s default — the prisma retry extension can
  // re-fire ops inside the txn on a transient blip, and we have a lot
  // of ops here (order + items + redemption + coupon increment + cart
  // wipes). 30s gives generous headroom on Railway's flaky proxy.
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: newOrderNumber(),
        userId,
        subtotal,
        shippingCost,
        total,
        currency: 'NGN',
        shipFullName: body.shipping.fullName,
        shipPhone: body.shipping.phone,
        shipAddressLine: body.shipping.addressLine,
        shipCity: body.shipping.city,
        shipCountry: body.shipping.country.toUpperCase(),
        paymentMethod: body.paymentMethod,
        couponCode,
        couponDiscount,
        shippingRateId: chosenRate?.id ?? null,
        items: {
          create: cart.items.map((i) => ({
            productId: i.productId,
            productSlug: i.product.slug,
            productName: i.product.name,
            productImage: i.product.images[0] ?? null,
            unitPrice: i.product.price,
            quantity: i.quantity,
            lineTotal: i.product.price * i.quantity,
          })),
        },
      },
      include: { items: true },
    });

    if (couponId) {
      await tx.couponRedemption.create({
        data: {
          couponId,
          userId,
          orderId: created.id,
          amountDiscounted: couponDiscount,
        },
      });
      await tx.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    return created;
  }, { timeout: 30_000, maxWait: 5_000 });

  await eventBus.emit('order.placed', {
    orderId: order.id,
    userId,
    total: order.total,
    currency: 'NGN',
    placedAt: order.createdAt.toISOString(),
  });

  return order;
}

export async function listOrders(userId: string) {
  return findOrdersByUser(userId);
}

export async function getOrder(userId: string, orderId: string) {
  const order = await findOrder(userId, orderId);
  if (!order) throw HttpError.notFound('Order not found');
  return order;
}

// computeDiscount export kept for future use (e.g. estimating discount in
// a /api/cart/coupon/preview endpoint).
export { computeDiscount };

// Suppress unused-export warning for Prisma type alias used elsewhere.
export type _OrdersServicePrismaTypes = Prisma.OrderCreateInput;
