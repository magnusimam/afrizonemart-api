import { env } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { sendEmail } from './service';
import { AbandonedCartEmail } from './templates/AbandonedCart';
import { OrderAwaitingPaymentEmail } from './templates/OrderAwaitingPayment';
import { OrderConfirmedEmail } from './templates/OrderConfirmed';
import { PaymentFailedEmail } from './templates/PaymentFailed';
import { PaymentReceivedEmail } from './templates/PaymentReceived';
import { OrderShippedEmail } from './templates/OrderShipped';
import { OrderDeliveredEmail } from './templates/OrderDelivered';
import { OrderCancelledEmail } from './templates/OrderCancelled';
import { RefundIssuedEmail } from './templates/RefundIssued';
import { WelcomeEmail } from './templates/Welcome';
import { PasswordResetEmail } from './templates/PasswordReset';

/**
 * Bridges domain events → transactional emails.
 *
 * Each subscriber loads the data it needs (rather than trusting whatever
 * shape was emitted), picks the matching React Email template, and
 * delegates to the central `sendEmail` service which records to the
 * Notification table.
 *
 * Called once at startup from server.ts. Keep all email-related event
 * wiring here — never `eventBus.on('order.x', ...)` from anywhere else
 * in the codebase, or notifications scatter and become unfindable.
 */

const fmtDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString('en-NG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const fmtDateTime = (d: Date | string): string =>
  new Date(d).toLocaleString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Rough ETA derived from current shipping data — keep in sync with
 * frontend success-page logic. When we add explicit ETA on Order, drop
 * this.
 */
function estimateEta(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return fmtDate(d);
}

async function loadOrderForEmail(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
}

const PAYMENT_LABEL: Record<string, string> = {
  PAYSTACK: 'Card / Paystack',
  GTSQUAD: 'Card / Squad',
  BANK_TRANSFER: 'Bank Transfer',
  CASH_ON_DELIVERY: 'Pay on Delivery',
};

export function startNotificationDispatcher(): void {
  // ---------- order.placed ----------
  // Tracker #47 — STRICT rule: this event does NOT send the "Order
  // Confirmed" email. order.placed fires before any payment has been
  // confirmed, so emailing a confirmation here would (and did) leak
  // a confirmation for failed/abandoned payments.
  //
  // For online-pay methods (CARD/MOBILE_MONEY/USSD/CRYPTO via
  // gateway): NO email here — we wait for `order.paid` from the
  // webhook or verifyPayment path.
  //
  // For offline-pay methods (BANK_TRANSFER / CASH_ON_DELIVERY):
  // send an "Order received — awaiting payment" email so the
  // customer has confirmation we got the order and the bank-
  // transfer details. The "Order confirmed" email comes later
  // when admin marks the order PAID.
  eventBus.on('order.placed', async ({ orderId }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    const isOffline =
      order.paymentMethod === 'BANK_TRANSFER' ||
      order.paymentMethod === 'CASH_ON_DELIVERY';
    if (!isOffline) return;

    /// Load matching bank account(s) for bank transfer. NGN-only
    /// today — when storefront sends multi-currency orders this
    /// reads from `order.currency` instead.
    let bankAccounts: Array<{
      bankName: string;
      accountName: string;
      accountNumber: string;
      currency: string;
      instructions?: string | null;
    }> = [];
    if (order.paymentMethod === 'BANK_TRANSFER') {
      const accounts = await prisma.paymentBankAccount.findMany({
        where: {
          isActive: true,
          currency: order.currency,
          OR: [
            { country: null },
            { country: order.shipCountry.toUpperCase() },
          ],
        },
        orderBy: [{ sortOrder: 'asc' }, { bankName: 'asc' }],
      });
      bankAccounts = accounts.map((a) => ({
        bankName: a.bankName,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        currency: a.currency,
        instructions: a.instructions,
      }));
    }

    const props = {
      customerName: order.user.name?.split(' ')[0] ?? 'there',
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethodLabel: PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod,
      bankAccounts,
      reference: order.orderNumber,
      orderUrl: `${env.WEB_URL}/account/orders/${order.id}`,
    };

    await sendEmail({
      type: 'order.awaiting_payment',
      to: order.user.email,
      subject: `Order ${order.orderNumber} received — awaiting payment`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber },
      template: OrderAwaitingPaymentEmail(props),
      variables: props as unknown as Record<string, unknown>,
    });
  });

  // ---------- order.paid ----------
  // Tracker #47 — THIS is the customer-facing "Order confirmed"
  // trigger. Fires from three paths, all funnelled through one
  // `applyOutcome` (Squad webhook), `verifyPayment` (post-redirect
  // poll), or admin manually flipping a bank-transfer order to
  // PAID. Subscribers don't care which.
  //
  // We send TWO emails: OrderConfirmed (the substantive "we've got
  // your order, here's what shipped to where") + PaymentReceived
  // (the financial receipt with amount + method + paidAt). Most
  // ecommerce platforms do both, and the receipt one is
  // particularly important for bank-transfer customers since it's
  // the first time they're told the transfer matched.
  eventBus.on('order.paid', async ({ orderId, method, source }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    const confirmedProps = {
      customerName: order.user.name?.split(' ')[0] ?? 'there',
      orderNumber: order.orderNumber,
      orderId: order.id,
      placedAt: fmtDateTime(order.createdAt),
      total: order.total,
      items: order.items.map((it) => ({
        name: it.productName,
        qty: it.quantity,
        price: it.unitPrice,
      })),
      shippingAddress: {
        line1: order.shipAddressLine,
        city: order.shipCity,
        region: order.shipCity,
        country: order.shipCountry,
      },
      estimatedDelivery: estimateEta(),
      trackUrl: `${env.WEB_URL}/account/orders/${order.id}`,
    };
    await sendEmail({
      type: 'order.confirmed',
      to: order.user.email,
      subject: `Order ${order.orderNumber} confirmed`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, source },
      template: OrderConfirmedEmail(confirmedProps),
      variables: confirmedProps as unknown as Record<string, unknown>,
    });

    const receiptProps = {
      customerName: order.user.name?.split(' ')[0] ?? 'there',
      orderNumber: order.orderNumber,
      amount: order.total - order.refundedTotal,
      method: PAYMENT_LABEL[method] ?? method,
      paidAt: fmtDateTime(new Date()),
      receiptUrl: `${env.WEB_URL}/account/orders/${order.id}`,
    };
    await sendEmail({
      type: 'payment.received',
      to: order.user.email,
      subject: `Payment received for ${order.orderNumber}`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, method, source },
      template: PaymentReceivedEmail(receiptProps),
      variables: receiptProps as unknown as Record<string, unknown>,
    });
  });

  // ---------- payment.failed ----------
  // Tracker #47 — terminal "gateway said no" event. Today's only
  // emitter is the FAILED branch inside applyOutcome. Sends a
  // customer-facing "try again" email with the gateway's reason if
  // available (e.g. "Merchant not configured for BIN"). Order stays
  // in PENDING_PAYMENT so the customer can retry on the order page
  // — we don't auto-cancel.
  eventBus.on('payment.failed', async ({ orderId, method, reason }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    const props = {
      customerName: order.user.name?.split(' ')[0] ?? 'there',
      orderNumber: order.orderNumber,
      amount: order.total,
      method: PAYMENT_LABEL[method] ?? method,
      reason: reason ?? null,
      retryUrl: `${env.WEB_URL}/account/orders/${order.id}`,
    };
    await sendEmail({
      type: 'payment.failed',
      to: order.user.email,
      subject: `Payment couldn't be processed for ${order.orderNumber}`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, method, reason },
      template: PaymentFailedEmail(props),
      variables: props as unknown as Record<string, unknown>,
    });
  });

  // ---------- order.shipped → OrderShipped ----------
  eventBus.on('order.shipped', async ({ orderId, carrier, trackingNumber }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    await sendEmail({
      type: 'order.shipped',
      to: order.user.email,
      subject: `Your order ${order.orderNumber} has shipped`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, carrier, trackingNumber },
      template: OrderShippedEmail({
        customerName: order.user.name?.split(' ')[0] ?? 'there',
        orderNumber: order.orderNumber,
        carrier: carrier ?? 'Our courier partner',
        trackingNumber: trackingNumber ?? '—',
        estimatedDelivery: estimateEta(),
        shippedAt: fmtDateTime(new Date()),
      }),
    });
  });

  // ---------- order.delivered → OrderDelivered ----------
  eventBus.on('order.delivered', async ({ orderId }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    await sendEmail({
      type: 'order.delivered',
      to: order.user.email,
      subject: `Your order ${order.orderNumber} has been delivered`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber },
      template: OrderDeliveredEmail({
        customerName: order.user.name?.split(' ')[0] ?? 'there',
        orderNumber: order.orderNumber,
        reviewUrl: `${env.WEB_URL}/account/orders/${order.id}#review`,
        reorderUrl: `${env.WEB_URL}/account/orders/${order.id}?reorder=1`,
      }),
    });
  });

  // ---------- order.cancelled → OrderCancelled ----------
  eventBus.on('order.cancelled', async ({ orderId, reason }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    const refundExpected = order.status === 'REFUNDED' || order.refundedTotal > 0;

    await sendEmail({
      type: 'order.cancelled',
      to: order.user.email,
      subject: `Order ${order.orderNumber} cancelled`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, reason },
      template: OrderCancelledEmail({
        customerName: order.user.name?.split(' ')[0] ?? 'there',
        orderNumber: order.orderNumber,
        reason,
        refundExpected,
        refundAmount: refundExpected ? order.refundedTotal || order.total : undefined,
        shopUrl: env.WEB_URL,
      }),
    });
  });

  // ---------- order.refunded → RefundIssued ----------
  eventBus.on('order.refunded', async ({ orderId, amount, reason }) => {
    const order = await loadOrderForEmail(orderId);
    if (!order || !order.user.email) return;

    await sendEmail({
      type: 'order.refunded',
      to: order.user.email,
      subject: `Refund issued for ${order.orderNumber}`,
      userId: order.user.id,
      context: { orderId, orderNumber: order.orderNumber, amount, reason },
      template: RefundIssuedEmail({
        customerName: order.user.name?.split(' ')[0] ?? 'there',
        orderNumber: order.orderNumber,
        amount,
        reason,
        refundedAt: fmtDateTime(new Date()),
        method: PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod,
      }),
    });
  });

  // ---------- user.registered → Welcome ----------
  eventBus.on('user.registered', async ({ userId, email }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const props = {
      customerName: user?.name?.split(' ')[0] ?? 'there',
      shopUrl: env.WEB_URL,
    };
    await sendEmail({
      type: 'user.welcome',
      to: email,
      subject: 'Welcome to Afrizonemart',
      userId,
      context: { userId },
      template: WelcomeEmail(props),
      variables: props as unknown as Record<string, unknown>,
    });
  });

  // ---------- cart.abandoned → AbandonedCartEmail ----------
  eventBus.on('cart.abandoned', async ({ userId, itemCount, total }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user?.email) return;
    const props = {
      customerName: user.name?.split(' ')[0] ?? 'there',
      itemCount,
      total,
      cartUrl: `${env.WEB_URL}/cart`,
    };
    await sendEmail({
      type: 'cart.abandoned',
      to: user.email,
      subject: `You left ${itemCount} item${itemCount === 1 ? '' : 's'} in your cart`,
      userId,
      context: { itemCount, total },
      template: AbandonedCartEmail(props),
      variables: props as unknown as Record<string, unknown>,
    });
  });

  // ---------- password.reset_requested → PasswordReset ----------
  eventBus.on(
    'password.reset_requested',
    async ({ userId, email, resetUrl, expiresInMinutes }) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const props = {
        customerName: user?.name?.split(' ')[0] ?? 'there',
        resetUrl,
        expiresInMinutes,
      };
      await sendEmail({
        type: 'password.reset',
        to: email,
        subject: 'Reset your Afrizonemart password',
        userId,
        context: { userId, expiresInMinutes },
        template: PasswordResetEmail(props),
        variables: props as unknown as Record<string, unknown>,
      });
    },
  );

  logger.info('notifications.dispatcher.started', {
    subscriptions: [
      'order.placed',
      'order.paid',
      'payment.failed',
      'order.shipped',
      'order.delivered',
      'order.cancelled',
      'order.refunded',
      'user.registered',
      'password.reset_requested',
      'cart.abandoned',
    ],
  });
}
