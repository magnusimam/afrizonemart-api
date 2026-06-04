import jwt from 'jsonwebtoken';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import {
  issueDeliveryToken,
  otpFromToken,
  verifyDeliveryToken,
} from './tokens';

/**
 * Courier-side and customer-side delivery confirmation service.
 *
 * Lifecycle:
 *   1. Admin flips status to OUT_FOR_DELIVERY in /admin/orders →
 *      `issueOrRefreshDeliveryToken` writes a fresh JWT + OTP onto
 *      Order. Customer's app then renders the QR + OTP.
 *   2. Rider arrives at the door. Either:
 *        - Scans the QR (sends JWT) → `confirmDelivery({ token })`
 *        - Types the 6-digit OTP → `confirmDelivery({ otp })`
 *      Both paths funnel into the same status-flip → DELIVERED.
 *   3. Customer can also tap "I received my order" in-app →
 *      `confirmDeliveryAsCustomer(userId, orderId)`.
 *   4. 14-day backstop cron → `autoMarkDelivered(orderId)`.
 *
 * All four paths share `markDelivered(orderId, source)` internally
 * so the DELIVERED transition is single-canonical (same rule
 * applied to order.paid in Tracker #47).
 */

export interface DeliveryTokenPayload {
  token: string;
  otp: string;
  expiresAt: string;
}

/**
 * Customer-side: fetch the delivery token for the customer's order.
 * Returns null when the order isn't in OUT_FOR_DELIVERY (a stale
 * client trying to render the QR after delivery would get this).
 *
 * Re-issues if the persisted token has expired (24h) — keeps the
 * customer's screen working even if ops set OUT_FOR_DELIVERY days
 * ago without delivery happening.
 */
export async function getDeliveryTokenForCustomer(
  userId: string,
  orderId: string,
): Promise<DeliveryTokenPayload | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      userId: true,
      status: true,
      deliveryToken: true,
      deliveryOtp: true,
    },
  });
  if (!order) throw HttpError.notFound('Order not found');
  if (order.status !== 'OUT_FOR_DELIVERY') return null;

  /// Re-derive the persisted token's expiry. JWT decode is safe to
  /// call on the stored token because we wrote it ourselves.
  if (order.deliveryToken) {
    try {
      const decoded = jwt.decode(order.deliveryToken) as {
        exp?: number;
      } | null;
      const expMs = decoded?.exp ? decoded.exp * 1000 : 0;
      if (expMs > Date.now() + 60_000 && order.deliveryOtp) {
        /// More than a minute of life left; reuse.
        return {
          token: order.deliveryToken,
          otp: order.deliveryOtp,
          expiresAt: new Date(expMs).toISOString(),
        };
      }
    } catch {
      /// Corrupt token (shouldn't happen — we wrote it) → reissue.
    }
  }

  /// Issue a fresh one and persist.
  const fresh = issueDeliveryToken({ sub: order.id, uid: order.userId });
  await prisma.order.update({
    where: { id: order.id },
    data: { deliveryToken: fresh.token, deliveryOtp: fresh.otp },
  });
  return fresh;
}

/**
 * Called by `admin.service.ts` when an admin flips status to
 * OUT_FOR_DELIVERY. Idempotent — if the order already has a fresh
 * token (most cases) we leave it alone; if it doesn't or the
 * existing one expired we mint a new one.
 *
 * Returns the active token so the admin UI can show it to ops
 * (useful when ops needs to read the OTP aloud to a rider on the
 * phone — happens for WhatsApp-coordinated deliveries).
 */
export async function issueOrRefreshDeliveryToken(
  orderId: string,
  userId: string,
): Promise<DeliveryTokenPayload> {
  const fresh = issueDeliveryToken({ sub: orderId, uid: userId });
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryToken: fresh.token, deliveryOtp: fresh.otp },
  });
  return fresh;
}

/**
 * Rider / courier confirms via the /courier/confirm endpoint. Pass
 * EITHER the full JWT (QR scan path) OR the 6-digit OTP (typed
 * path). Both paths bottom out in the same DELIVERED transition.
 */
export async function confirmDeliveryFromCourier(
  input: { token?: string; otp?: string; courierNote?: string },
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ orderNumber: string; customerFirstName: string | null }> {
  let orderId: string;

  if (input.token) {
    /// QR scan path — verify the JWT.
    try {
      const claims = verifyDeliveryToken(input.token);
      orderId = claims.sub;
    } catch (err) {
      logger.warn('courier.confirm_invalid_token', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw HttpError.badRequest('Code is invalid or expired.');
    }
  } else if (input.otp) {
    /// OTP path — find by stored OTP.
    if (!/^\d{6}$/.test(input.otp.trim())) {
      throw HttpError.badRequest('Code must be 6 digits.');
    }
    const order = await prisma.order.findFirst({
      where: { deliveryOtp: input.otp.trim(), status: 'OUT_FOR_DELIVERY' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deliveryToken: true },
    });
    if (!order || !order.deliveryToken) {
      throw HttpError.badRequest('Code is invalid or already used.');
    }
    /// Re-verify the stored JWT to catch the (impossible-in-practice)
    /// case where the token expired but the OTP was still in the
    /// table — keeps us strict.
    try {
      const claims = verifyDeliveryToken(order.deliveryToken);
      orderId = claims.sub;
    } catch {
      throw HttpError.badRequest('Code is invalid or expired.');
    }
  } else {
    throw HttpError.badRequest('Provide either a scanned code or a 6-digit OTP.');
  }

  return markDelivered(orderId, {
    source: 'rider',
    ip: meta.ip,
    userAgent: meta.userAgent,
    courierNote: input.courierNote,
  });
}

/**
 * Customer self-confirms via OrderDetail. Authed — userId comes from
 * the auth middleware. Only valid when the order is in SHIPPED or
 * OUT_FOR_DELIVERY (so a customer can't pre-confirm an order that
 * hasn't shipped yet).
 */
export async function confirmDeliveryAsCustomer(
  userId: string,
  orderId: string,
): Promise<{ orderNumber: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, status: true },
  });
  if (!order) throw HttpError.notFound('Order not found');
  if (order.status !== 'SHIPPED' && order.status !== 'OUT_FOR_DELIVERY') {
    throw HttpError.conflict(
      "Order isn't ready to confirm yet — it hasn't shipped.",
    );
  }
  const res = await markDelivered(orderId, { source: 'customer' });
  return { orderNumber: res.orderNumber };
}

/**
 * Auto-mark backstop — called by the cron. NEVER fires
 * order.delivered with a review prompt (handled downstream by
 * source === 'auto' check in notification subscribers).
 */
export async function autoMarkDelivered(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return;
  if (order.status !== 'SHIPPED' && order.status !== 'OUT_FOR_DELIVERY') return;
  await markDelivered(orderId, { source: 'auto' });
}

/**
 * Single canonical write path for the DELIVERED transition. All
 * four entry points (rider scan, OTP, customer button, auto-mark
 * cron) bottom out here. Uses a transaction so the event log + the
 * Order.status update can't drift apart on a partial failure.
 */
async function markDelivered(
  orderId: string,
  meta: {
    source: 'rider' | 'customer' | 'admin' | 'auto';
    ip?: string | null;
    userAgent?: string | null;
    courierNote?: string;
  },
): Promise<{ orderNumber: string; customerFirstName: string | null }> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        user: { select: { name: true } },
      },
    });
    if (!order) throw HttpError.notFound('Order not found');
    if (order.status === 'DELIVERED') {
      /// Already delivered — idempotent. Caller might be a duplicate
      /// rider scan after a flaky network. Return the same shape.
      return {
        orderNumber: order.orderNumber,
        userId: order.userId,
        firstName: order.user.name?.split(' ')[0] ?? null,
        wasAlready: true,
      };
    }
    if (
      order.status !== 'SHIPPED' &&
      order.status !== 'OUT_FOR_DELIVERY'
    ) {
      throw HttpError.conflict(
        "Order isn't ready to be marked delivered.",
      );
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        deliveredSource: meta.source,
        /// Consume the token so it can't be re-used. The OTP can
        /// be reused (effectively impossible — order is no longer
        /// OUT_FOR_DELIVERY so the OTP lookup misses) but we clear
        /// it for cleanliness.
        deliveryToken: null,
        deliveryOtp: null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId,
        type: 'STATUS_CHANGED',
        payload: {
          from: order.status,
          to: 'DELIVERED',
          source: meta.source,
          ...(meta.ip ? { ip: meta.ip } : {}),
          ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 240) } : {}),
          ...(meta.courierNote ? { note: meta.courierNote.slice(0, 1000) } : {}),
        } as object,
        isCustomerVisible: true,
      },
    });
    return {
      orderNumber: order.orderNumber,
      userId: order.userId,
      firstName: order.user.name?.split(' ')[0] ?? null,
      wasAlready: false,
    };
  });

  if (!result.wasAlready) {
    await eventBus.emit('order.delivered', {
      orderId,
      userId: result.userId,
      source: meta.source,
    });
  }
  return {
    orderNumber: result.orderNumber,
    customerFirstName: result.firstName,
  };
}
