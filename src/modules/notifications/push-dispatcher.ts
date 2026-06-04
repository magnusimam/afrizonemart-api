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

  eventBus.on('order.delivered', async ({ orderId }) => {
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
