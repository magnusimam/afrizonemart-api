import { env } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logAudit } from '@/modules/audit/service';
import type { PaymentGateway, WebhookOutcome } from './gateway';
import { buildGateway } from './registry';
import { StubGateway } from './stub-gateway';

const stub = new StubGateway();

/**
 * Loads active PaymentGatewayConfig rows for a given currency, ordered
 * by priority (lowest number first).
 */
async function loadActiveConfigs(currency?: string) {
  return prisma.paymentGatewayConfig.findMany({
    where: {
      isActive: true,
      ...(currency ? { currencies: { has: currency } } : {}),
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Public-shape gateway summary returned to the storefront for the
 * checkout picker. Never includes credentials.
 */
export interface PublicGatewaySummary {
  id: string;
  provider: string;
  label: string;
  environment: string;
  currencies: string[];
  metadata: Record<string, unknown>;
}

export async function listPublicGateways(currency?: string): Promise<PublicGatewaySummary[]> {
  const rows = await loadActiveConfigs(currency);
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    environment: r.environment,
    currencies: r.currencies,
    metadata: r.metadata as Record<string, unknown>,
  }));
}

/**
 * Returns every active gateway, in priority order. Used by the webhook
 * handler to dispatch incoming deliveries — each gateway gets a chance
 * to recognise the signature.
 */
export async function activeGateways(currency?: string): Promise<PaymentGateway[]> {
  const configs = await loadActiveConfigs(currency);
  if (configs.length > 0) {
    return configs.map((cfg) =>
      buildGateway({
        provider: cfg.provider,
        environment: cfg.environment,
        credentials: cfg.credentials as Record<string, unknown>,
      }),
    );
  }
  if (env.SQUAD_SECRET_KEY && env.SQUAD_ENVIRONMENT) {
    return [
      buildGateway({
        provider: 'squad',
        environment: env.SQUAD_ENVIRONMENT,
        credentials: { secretKey: env.SQUAD_SECRET_KEY },
      }),
    ];
  }
  return [stub];
}

/**
 * Pick the highest-priority active gateway for an order. Falls back to
 * env-configured Squad (legacy boot path), then to the StubGateway so
 * local dev never breaks. New deploys are encouraged to migrate via
 * admin → Payment Gateways.
 */
export async function activeGateway(currency?: string): Promise<PaymentGateway> {
  const configs = await loadActiveConfigs(currency);
  if (configs.length > 0) {
    const cfg = configs[0];
    return buildGateway({
      provider: cfg.provider,
      environment: cfg.environment,
      credentials: cfg.credentials as Record<string, unknown>,
    });
  }
  if (env.SQUAD_SECRET_KEY && env.SQUAD_ENVIRONMENT) {
    return buildGateway({
      provider: 'squad',
      environment: env.SQUAD_ENVIRONMENT,
      credentials: { secretKey: env.SQUAD_SECRET_KEY },
    });
  }
  return stub;
}

/**
 * Looks up a specific gateway by its config ID (or by provider key as
 * a legacy fallback). Used by the checkout picker which tells us which
 * one the customer chose.
 */
async function gatewayById(id: string): Promise<PaymentGateway> {
  if (id) {
    const cfg = await prisma.paymentGatewayConfig.findUnique({ where: { id } });
    if (cfg && cfg.isActive) {
      return buildGateway({
        provider: cfg.provider,
        environment: cfg.environment,
        credentials: cfg.credentials as Record<string, unknown>,
      });
    }
  }
  // Legacy: callers used to pass 'squad' literally. Resolve via env.
  if (id === 'squad' && env.SQUAD_SECRET_KEY && env.SQUAD_ENVIRONMENT) {
    return buildGateway({
      provider: 'squad',
      environment: env.SQUAD_ENVIRONMENT,
      credentials: { secretKey: env.SQUAD_SECRET_KEY },
    });
  }
  return stub;
}

logger.info('payments.gateway_selection', {
  source: 'PaymentGatewayConfig table (with env fallback)',
});

export async function initPayment(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!order) throw HttpError.notFound('Order not found');
  if (order.userId !== userId) throw HttpError.forbidden('Not your order');
  if (order.status !== 'PENDING_PAYMENT') {
    throw HttpError.badRequest(`Order is already ${order.status}`);
  }

  const gw = await activeGateway(order.currency);
  const callbackUrl = `${process.env.WEB_URL ?? 'http://localhost:3000'}/checkout/success?order=${order.orderNumber}`;
  const init = await gw.init({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: order.total,
    currency: order.currency,
    customerEmail: order.user?.email ?? '',
    customerName: order.user?.name,
    callbackUrl,
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      gateway: gw.id,
      gatewayRef: init.gatewayRef,
      amount: order.total,
      currency: order.currency,
      checkoutUrl: init.checkoutUrl,
      rawPayload: init.rawPayload ?? {},
    },
  });

  return {
    paymentId: payment.id,
    gatewayRef: init.gatewayRef,
    checkoutUrl: init.checkoutUrl,
  };
}

/**
 * Apply a webhook outcome to the matching Payment + Order. Idempotent —
 * if the order is already PAID we return 200 without re-emitting events.
 */
export async function applyWebhookOutcome(outcome: WebhookOutcome): Promise<{ acknowledged: boolean; reason?: string }> {
  if (outcome.status === 'IGNORED') return { acknowledged: false, reason: outcome.reason };

  const payment = await prisma.payment.findUnique({
    where: { gatewayRef: outcome.gatewayRef },
    include: { order: true },
  });
  if (!payment) return { acknowledged: false, reason: 'Unknown gatewayRef' };

  // Already settled? No-op.
  if (payment.status === outcome.status) return { acknowledged: true };

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: outcome.status,
        rawPayload: outcome.rawPayload,
        settledAt: new Date(),
      },
    });
    if (outcome.status === 'SUCCEEDED' && payment.order.status === 'PENDING_PAYMENT') {
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'PAID',
          paymentRef: outcome.gatewayRef,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'PAYMENT_RECEIVED',
          payload: { gatewayRef: outcome.gatewayRef, amount: payment.amount } as object,
          isCustomerVisible: true,
        },
      });
    }
  });

  if (outcome.status === 'SUCCEEDED' && payment.order.status === 'PENDING_PAYMENT') {
    await eventBus.emit('order.paid', {
      orderId: payment.orderId,
      paymentId: payment.id,
      method: payment.gateway,
    });
    await logAudit({
      entityType: 'order',
      entityId: payment.orderId,
      action: 'order.paid',
      changes: { gateway: payment.gateway, gatewayRef: outcome.gatewayRef, amount: payment.amount },
    });
  }

  return { acknowledged: true };
}

export async function verifyPayment(gatewayRef: string, userId: string) {
  const payment = await prisma.payment.findUnique({
    where: { gatewayRef },
    include: { order: { select: { userId: true, status: true, orderNumber: true } } },
  });
  if (!payment) throw HttpError.notFound('Payment not found');
  if (payment.order.userId !== userId) throw HttpError.forbidden('Not your payment');

  // If the webhook hasn't landed yet, ask the gateway directly.
  if (payment.status === 'INITIATED') {
    const gw = await gatewayById(payment.gateway);
    const outcome = await gw.verify(gatewayRef);
    await applyWebhookOutcome(outcome);
  }

  // Re-fetch after potential update.
  const fresh = await prisma.payment.findUnique({
    where: { gatewayRef },
    include: { order: { select: { status: true, orderNumber: true } } },
  });
  return {
    status: fresh?.status,
    orderStatus: fresh?.order.status,
    orderNumber: fresh?.order.orderNumber,
  };
}

/**
 * Polling helper used by the success page: given an order id-or-number,
 * find the most recent INITIATED payment and verify it against the
 * gateway. Useful when the webhook URL isn't yet pointed at our server
 * (e.g. local dev without ngrok, or before going live).
 */
export async function checkOrderPayment(orderIdOrNumber: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: {
      userId,
      OR: [{ id: orderIdOrNumber }, { orderNumber: orderIdOrNumber }],
    },
    include: {
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!order) throw HttpError.notFound('Order not found');

  // Already terminal? Nothing to do.
  if (order.status !== 'PENDING_PAYMENT') {
    return { orderStatus: order.status, orderNumber: order.orderNumber };
  }

  const latest = order.payments[0];
  if (!latest || latest.status !== 'INITIATED') {
    return { orderStatus: order.status, orderNumber: order.orderNumber };
  }

  const gw = await gatewayById(latest.gateway);
  const outcome = await gw.verify(latest.gatewayRef);
  await applyWebhookOutcome(outcome);

  const fresh = await prisma.order.findFirst({
    where: { id: order.id },
    select: { status: true, orderNumber: true },
  });
  return {
    orderStatus: fresh?.status ?? order.status,
    orderNumber: fresh?.orderNumber ?? order.orderNumber,
  };
}
