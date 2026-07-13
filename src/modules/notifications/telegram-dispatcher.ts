import { env } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import {
  adminChatIds,
  escapeHtml,
  telegramProvider,
} from './telegram-provider';

/**
 * Bridges every order-lifecycle event → admin Telegram alert.
 *
 * Interim replacement for the WhatsApp admin alerts, which are
 * blocked on Meta Business verification + template approval. Telegram
 * needs neither, so this is the channel that actually tells Magnus an
 * order happened today (2026-07-13).
 *
 * Scope decision (Magnus, 2026-07-13): "any type and form" — this
 * subscribes to the WHOLE order lifecycle, not just `order.paid`:
 *   • order.placed          → a new order landed (pending payment)
 *   • order.paid            → payment confirmed (complete)
 *   • payment.failed        → payment attempt failed
 *   • order.shipped         → marked shipped
 *   • order.out_for_delivery→ out for delivery
 *   • order.delivered       → delivered
 *   • order.cancelled       → cancelled
 *   • order.refunded        → refunded
 *
 * The shipped/delivered/cancelled/refunded transitions are usually
 * admin-driven, so Magnus will occasionally get a ping for his own
 * dashboard action — accepted, because he asked to see everything.
 *
 * Mirrors whatsapp-dispatcher.ts: subscribes once at startup from
 * server.ts, keeps its own file so failures are isolated from the
 * email + WhatsApp pipelines, and swallows/logs all errors so an
 * alert failure can never crash the event bus or block a sale.
 *
 * No-ops cleanly (logs a one-time hint on boot, then stays silent)
 * when ORDER_NOTIFY_TELEGRAM_CHAT_ID is empty, so dev + not-yet-
 * configured prod don't spam logs on every order.
 */
export function startTelegramDispatcher(): void {
  const chatIds = adminChatIds();
  if (chatIds.length === 0) {
    logger.info('telegram.dispatcher_disabled', {
      reason: 'ORDER_NOTIFY_TELEGRAM_CHAT_ID is empty',
    });
    return;
  }

  logger.info('telegram.dispatcher_enabled', {
    chatCount: chatIds.length,
    provider: telegramProvider().name,
  });

  /// One subscription per event. Each maps its (differently-shaped)
  /// payload down to a headline + optional extra context lines; the
  /// shared sendAlert() fetches the order + fans out to every chat.
  eventBus.on('order.placed', ({ orderId }) =>
    sendAlert(orderId, '🆕 New order — awaiting payment'),
  );
  eventBus.on('order.paid', ({ orderId, method, source }) =>
    sendAlert(orderId, '✅ Payment received', [
      `Method: ${escapeHtml(method)}`,
      `Confirmed via: ${escapeHtml(prettySource(source))}`,
    ]),
  );
  eventBus.on('payment.failed', ({ orderId, method, reason }) =>
    sendAlert(orderId, '❌ Payment FAILED', [
      `Method: ${escapeHtml(method)}`,
      ...(reason ? [`Reason: ${escapeHtml(reason)}`] : []),
    ]),
  );
  eventBus.on('order.shipped', ({ orderId, carrier, trackingNumber }) =>
    sendAlert(orderId, '📦 Order shipped', [
      ...(carrier ? [`Carrier: ${escapeHtml(carrier)}`] : []),
      ...(trackingNumber
        ? [`Tracking: ${escapeHtml(trackingNumber)}`]
        : []),
    ]),
  );
  eventBus.on('order.out_for_delivery', ({ orderId }) =>
    sendAlert(orderId, '🚚 Out for delivery'),
  );
  eventBus.on('order.delivered', ({ orderId, source }) =>
    sendAlert(orderId, '🎉 Order delivered', [
      `Confirmed by: ${escapeHtml(source)}`,
    ]),
  );
  eventBus.on('order.cancelled', ({ orderId, reason }) =>
    sendAlert(orderId, '🚫 Order cancelled', [
      ...(reason ? [`Reason: ${escapeHtml(reason)}`] : []),
    ]),
  );
  eventBus.on('order.refunded', ({ orderId, amount, reason }) =>
    sendAlert(orderId, '💸 Order refunded', [
      `Refund amount: ${amount.toLocaleString('en-NG')}`,
      ...(reason ? [`Reason: ${escapeHtml(reason)}`] : []),
    ]),
  );
}

/**
 * Fetch the order, render an HTML message, and send it to every
 * configured admin chat. All failures are caught + logged — this is
 * a side-effect on the sale path and must never throw upward.
 *
 * @param headline  the event line, e.g. "✅ Payment received"
 * @param extra     optional context lines appended under the summary
 */
async function sendAlert(
  orderId: string,
  headline: string,
  extra: string[] = [],
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        currency: true,
        status: true,
        shipCity: true,
        shipCountry: true,
        shipFullName: true,
        user: { select: { name: true } },
      },
    });
    if (!order) {
      logger.warn('telegram.order_missing', { orderId, headline });
      return;
    }

    const customerName =
      order.user.name?.trim() || order.shipFullName || 'a customer';
    const destination = [order.shipCity, order.shipCountry]
      .filter(Boolean)
      .join(', ');

    /// Blank line between the headline and the order summary; extra
    /// context lines (if any) sit under the summary block.
    const lines = [
      `<b>${headline}</b>`,
      '',
      `Order: <b>${escapeHtml(order.orderNumber)}</b>`,
      `Total: <b>${formatTotal(order.total, order.currency)}</b>`,
      `Customer: ${escapeHtml(customerName)}`,
      ...(destination ? [`Ship to: ${escapeHtml(destination)}`] : []),
      `Status: ${escapeHtml(order.status)}`,
      ...extra,
      '',
      `<a href="${env.WEB_URL}/admin/orders/${order.id}">Open in admin →</a>`,
    ];
    const text = lines.join('\n');

    const provider = telegramProvider();
    for (const chatId of adminChatIds()) {
      try {
        const { id } = await provider.send({ chatId, text });
        logger.info('telegram.sent', {
          chatId,
          orderId: order.id,
          messageId: id,
          event: headline,
        });
      } catch (err) {
        /// Per-chat isolation — one blocked chat shouldn't suppress
        /// the alert for the others.
        logger.error('telegram.send_failed', {
          chatId,
          orderId: order.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    /// Outer guard — never let a Telegram failure bubble into the
    /// event bus (it fans out to email/loyalty/webhooks too).
    logger.error('telegram.dispatcher_unexpected', {
      orderId,
      headline,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/// Currency formatting — mirrors the WhatsApp dispatcher so the two
/// admin channels read identically. `total` is stored in whole
/// currency units (e.g. 12500 = ₦12,500), not minor units.
function formatTotal(amount: number, currency: string): string {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-NG')}`;
  }
  return `${currency} ${amount.toLocaleString('en-NG')}`;
}

/// Humanise the `order.paid` source enum for the alert body.
function prettySource(source: string): string {
  switch (source) {
    case 'gateway_webhook':
      return 'gateway webhook';
    case 'verify_redirect':
      return 'redirect verify';
    case 'reconciliation_cron':
      return 'reconciliation cron';
    case 'admin':
      return 'admin (manual)';
    default:
      return source;
  }
}
