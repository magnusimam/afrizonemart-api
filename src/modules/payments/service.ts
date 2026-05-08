import { Prisma } from '@prisma/client';
import { env, isProduction } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { decryptCredentials } from '@/lib/crypto-secret';
import { HttpError } from '@/middleware/error-handler';
import { logAudit } from '@/modules/audit/service';
import type { PaymentGateway, WebhookOutcome } from './gateway';
import { buildGateway } from './registry';
import { StubGateway } from './stub-gateway';

/// Phase 11.3 (audit M5): the stub gateway marks payments SUCCEEDED
/// instantly without actually charging anyone. Falling back to it in
/// production means a misconfigured prod silently lets customers
/// "pay" without paying. Block the fallback in prod unless the
/// operator explicitly opts in (ALLOW_STUB_GATEWAY=1) — staging that
/// intentionally runs with NODE_ENV=production for parity testing.
function assertStubAllowed(reason: string): void {
  if (!isProduction || env.ALLOW_STUB_GATEWAY) return;
  logger.error('payments.stub_blocked_in_prod', { reason });
  throw new Error(
    `No payment gateway is configured (${reason}). The stub gateway is disabled in production. Configure a provider in admin → Payment Gateways or set ALLOW_STUB_GATEWAY=1.`,
  );
}

/// Phase 11.3 (audit H3): replay-guard for inbound payment webhooks.
/// Caller passes the provider id + SHA-256 of the raw body; the service
/// inserts an `InboundWebhookEvent` row inside the same transaction
/// that mutates Payment+Order. Identical replays hit the unique
/// `(provider, bodyHash)` index and are rejected as already-processed.
export interface WebhookReplayGuard {
  provider: string;
  bodyHash: string;
}

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
        credentials: decryptCredentials(cfg.credentials as Record<string, unknown>),
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
  assertStubAllowed('no active gateway config and no SQUAD_* env');
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
      credentials: decryptCredentials(cfg.credentials as Record<string, unknown>),
    });
  }
  if (env.SQUAD_SECRET_KEY && env.SQUAD_ENVIRONMENT) {
    return buildGateway({
      provider: 'squad',
      environment: env.SQUAD_ENVIRONMENT,
      credentials: { secretKey: env.SQUAD_SECRET_KEY },
    });
  }
  assertStubAllowed('no active gateway config and no SQUAD_* env');
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
        credentials: decryptCredentials(cfg.credentials as Record<string, unknown>),
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
  assertStubAllowed(`unknown or inactive gateway id "${id}"`);
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
export async function applyWebhookOutcome(
  outcome: WebhookOutcome,
  replayGuard?: WebhookReplayGuard,
): Promise<{ acknowledged: boolean; reason?: string }> {
  if (outcome.status === 'IGNORED') return { acknowledged: false, reason: outcome.reason };

  const payment = await prisma.payment.findUnique({
    where: { gatewayRef: outcome.gatewayRef },
    include: { order: true },
  });
  if (!payment) return { acknowledged: false, reason: 'Unknown gatewayRef' };

  // Already settled? No-op.
  if (payment.status === outcome.status) return { acknowledged: true };

  // Phase 11.3 (audit H4): if the gateway reported an amount/currency,
  // verify they match the order. A compromised gateway account or
  // misconfigured provider can otherwise downgrade an order's amount
  // (e.g. report ₦5 paid when the order is ₦50,000). One Naira of
  // tolerance for rounding noise on currency conversions.
  if (outcome.status === 'SUCCEEDED' && outcome.verified) {
    const claimed = outcome.verified;
    const orderTotal = payment.order.total;
    const orderCurrency = payment.order.currency.toUpperCase();
    const amountMismatch = Math.abs(claimed.amount - orderTotal) > 1;
    const currencyMismatch = claimed.currency !== orderCurrency;
    if (amountMismatch || currencyMismatch) {
      logger.error('payments.webhook_amount_mismatch', {
        orderId: payment.orderId,
        gatewayRef: outcome.gatewayRef,
        claimedAmount: claimed.amount,
        claimedCurrency: claimed.currency,
        orderAmount: orderTotal,
        orderCurrency,
      });
      await logAudit({
        entityType: 'order',
        entityId: payment.orderId,
        action: 'payment.webhook_rejected',
        changes: {
          reason: 'amount_or_currency_mismatch',
          gatewayRef: outcome.gatewayRef,
          claimedAmount: claimed.amount,
          claimedCurrency: claimed.currency,
          orderAmount: orderTotal,
          orderCurrency,
        },
      });
      return {
        acknowledged: false,
        reason: 'Amount or currency does not match the order',
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Phase 11.3 (audit H3): record-then-mutate. If two identical
      // webhook bodies hit the server concurrently, the second
      // INSERT trips the (provider, bodyHash) unique index and
      // rolls back the whole tx — including the Payment/Order
      // mutations — so a replay can never re-flip an order.
      if (replayGuard) {
        await tx.inboundWebhookEvent.create({
          data: {
            provider: replayGuard.provider,
            bodyHash: replayGuard.bodyHash,
            outcome: outcome.status,
          },
        });
      }
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
  } catch (err) {
    if (
      replayGuard &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      logger.warn('payments.webhook_replay_blocked', {
        provider: replayGuard.provider,
        bodyHash: replayGuard.bodyHash,
        gatewayRef: outcome.gatewayRef,
      });
      await logAudit({
        entityType: 'order',
        entityId: payment.orderId,
        action: 'payment.webhook_replay_blocked',
        changes: {
          provider: replayGuard.provider,
          bodyHash: replayGuard.bodyHash,
          gatewayRef: outcome.gatewayRef,
        },
      });
      return { acknowledged: true, reason: 'Replay (already processed)' };
    }
    throw err;
  }

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
