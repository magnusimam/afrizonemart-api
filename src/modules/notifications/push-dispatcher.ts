import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { findFreshTokensForUser, touchPushToken } from '@/modules/push/repository';
import { pushProvider, type PushMessage } from './push-provider';

/**
 * Bridges order lifecycle events → mobile push notifications.
 *
 * Subscribed once at startup. Separate from the email + WhatsApp
 * dispatchers — each channel owns its own failure mode, its own
 * "is this user opted in" gate, and its own deep-link payload.
 *
 * Today's signals: order.paid, order.shipped, order.delivered,
 * order.cancelled, payment.failed. The customer feels each step
 * land in their pocket — the missing half of the timeline UX we
 * just shipped.
 *
 * Per-user fan-out: if the customer has the app installed on
 * multiple devices (phone + tablet), they get the push on each one.
 * Per-token failures are isolated; a dead tablet doesn't block the
 * phone notification.
 */
export function startPushDispatcher(): void {
  logger.info('push.dispatcher_enabled', {
    provider: pushProvider().name,
  });

  eventBus.on('order.paid', async ({ orderId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(order.userId, {
      title: 'Payment received',
      body: `Order #${order.orderNumber} is paid — we're preparing it now.`,
      data: { deepLink: `afrizonemart://order/${order.id}`, type: 'order.paid' },
    });
  });

  eventBus.on('order.shipped', async ({ orderId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(order.userId, {
      title: 'On the way',
      body: `Order #${order.orderNumber} has shipped.`,
      data: { deepLink: `afrizonemart://order/${order.id}`, type: 'order.shipped' },
    });
  });

  eventBus.on('order.out_for_delivery', async ({ orderId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    /// Tap-deep-links to the OrderDetail screen which, with status
    /// OUT_FOR_DELIVERY, shows the "Show your delivery code" CTA.
    await sendToUser(order.userId, {
      title: 'Out for delivery',
      body: `Your order #${order.orderNumber} is on the way. Open the app when the rider arrives.`,
      data: {
        deepLink: `afrizonemart://order/${order.id}`,
        type: 'order.out_for_delivery',
      },
    });
  });

  eventBus.on('order.delivered', async ({ orderId, source }) => {
    /// Skip the celebratory push for auto-mark backstop — customer
    /// who never confirmed shouldn't get a "Delivered 🎉" message
    /// 14 days later, that would look broken.
    if (source === 'auto') return;
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(order.userId, {
      title: 'Delivered',
      body: `Order #${order.orderNumber} arrived. Enjoy!`,
      data: {
        deepLink: `afrizonemart://order/${order.id}`,
        type: 'order.delivered',
      },
    });
  });

  eventBus.on('order.cancelled', async ({ orderId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(order.userId, {
      title: 'Order cancelled',
      body: `Order #${order.orderNumber} has been cancelled.`,
      data: {
        deepLink: `afrizonemart://order/${order.id}`,
        type: 'order.cancelled',
      },
    });
  });

  eventBus.on('cart.abandoned', async ({ userId, itemCount }) => {
    /// Already gated upstream by the cron's "send-once-per-cart"
    /// rule — see cart/abandoned-cron.ts. We trust it; no extra
    /// dedup here.
    const noun = itemCount === 1 ? 'item' : 'items';
    await sendToUser(userId, {
      title: 'Still thinking about it?',
      body: `You left ${itemCount} ${noun} in your cart. Tap to pick up where you left off.`,
      data: { deepLink: 'afrizonemart://cart', type: 'cart.abandoned' },
    });
  });

  eventBus.on('order.review_nudge_due', async ({ orderId, userId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(userId, {
      title: 'How was your order?',
      body: `Tap to rate the items in order #${order.orderNumber}.`,
      data: {
        deepLink: `afrizonemart://order/${order.id}`,
        type: 'order.review_nudge_due',
      },
    });
  });

  eventBus.on('payment.failed', async ({ orderId }) => {
    const order = await loadOrderForPush(orderId);
    if (!order) return;
    await sendToUser(order.userId, {
      title: 'Payment failed',
      body: `We couldn't process payment for order #${order.orderNumber}. Tap to retry.`,
      data: {
        deepLink: `afrizonemart://order/${order.id}`,
        type: 'payment.failed',
      },
    });
  });
}

interface OrderForPush {
  id: string;
  userId: string;
  orderNumber: string;
}

async function loadOrderForPush(orderId: string): Promise<OrderForPush | null> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, orderNumber: true },
    });
    return order ?? null;
  } catch (err) {
    logger.error('push.load_order_failed', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function sendToUser(
  userId: string,
  msg: Omit<PushMessage, 'to'>,
): Promise<void> {
  const tokens = await findFreshTokensForUser(userId);
  if (tokens.length === 0) return;
  const provider = pushProvider();
  await Promise.all(
    tokens.map(async (t) => {
      const { ok } = await provider.send({ ...msg, to: t.token });
      if (ok) await touchPushToken(t.token);
    }),
  );
}
