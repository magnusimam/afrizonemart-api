import { env } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { adminRecipients, whatsappProvider } from './whatsapp-provider';

/**
 * Bridges `order.paid` → admin WhatsApp alert.
 *
 * Subscribes once at startup from server.ts. Kept separate from the
 * email dispatcher because:
 *   1. Different surface (admin team, not customers) — easier to
 *      reason about when the wiring is in its own file.
 *   2. Failures shouldn't block the email pipeline (and vice
 *      versa). The hook swallows errors and logs them.
 *
 * Only fires when the env says we have at least one recipient AND a
 * template name. Outside that, the dispatcher logs a one-time hint
 * on startup and stays silent — so dev environments don't spam logs
 * with "WhatsApp not configured" for every order.
 */
export function startWhatsAppDispatcher(): void {
  const recipients = adminRecipients();
  if (recipients.length === 0) {
    logger.info('whatsapp.dispatcher_disabled', {
      reason: 'ORDER_NOTIFY_WHATSAPP_TO is empty',
    });
    return;
  }
  const templateName = env.WHATSAPP_TEMPLATE_NAME;
  if (!templateName) {
    logger.info('whatsapp.dispatcher_disabled', {
      reason: 'WHATSAPP_TEMPLATE_NAME is empty',
    });
    return;
  }

  logger.info('whatsapp.dispatcher_enabled', {
    recipientCount: recipients.length,
    template: templateName,
    provider: whatsappProvider().name,
  });

  eventBus.on('order.paid', async ({ orderId }) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          currency: true,
          shipFullName: true,
          user: { select: { name: true } },
        },
      });
      if (!order) return;

      const customerName =
        order.user.name?.trim() || order.shipFullName || 'a customer';
      const params: string[] = [
        order.orderNumber,
        formatTotal(order.total, order.currency),
        customerName,
        `${env.WEB_URL}/admin/orders/${order.id}`,
      ];

      const provider = whatsappProvider();
      for (const to of recipients) {
        try {
          const { id } = await provider.send({
            to,
            templateName,
            language: env.WHATSAPP_TEMPLATE_LANG,
            parameters: params,
          });
          logger.info('whatsapp.sent', {
            to,
            orderId: order.id,
            messageId: id,
          });
        } catch (err) {
          /// Per-recipient failures are isolated — one admin number
          /// being blocked shouldn't suppress alerts for the others.
          logger.error('whatsapp.send_failed', {
            to,
            orderId: order.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      /// Outer guard — never let a WhatsApp failure crash the
      /// event bus subscription (would also kill the email
      /// pipeline that's wired to the same event).
      logger.error('whatsapp.dispatcher_unexpected', {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/// Naira formatting that the template expects: "₦12,500". For
/// non-NGN currencies fall back to "<code> <amount>" (e.g. "USD
/// 25"). Keep it byte-cheap — fancy locale formatting can blow up
/// on minimal Node builds.
function formatTotal(amount: number, currency: string): string {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-NG')}`;
  }
  return `${currency} ${amount.toLocaleString('en-NG')}`;
}
