import { createHmac, randomBytes } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import type { InitArgs, InitResult, PaymentGateway, WebhookOutcome } from './gateway';

const STUB_SECRET = env.JWT_SECRET; // reuse — stub-only

/**
 * Local-dev stub gateway. Mimics the redirect-and-callback dance of a
 * real gateway so the whole flow works without external keys.
 *
 * - `init` returns a checkoutUrl pointing to our own
 *   `/api/payments/stub-checkout/:ref` endpoint, which after a 1s
 *   simulated processing window POSTs back to our webhook with a
 *   valid signature.
 * - `parseWebhook` validates the same HMAC signature.
 * - `verify` always returns SUCCEEDED (stub doesn't track in-progress).
 *
 * Swap to GtSquadGateway by setting payments.gtsquad.environment in
 * Settings + providing keys. The rest of the codebase doesn't change.
 */
export class StubGateway implements PaymentGateway {
  readonly id = 'stub';

  async init(args: InitArgs): Promise<InitResult> {
    const gatewayRef = `stub_${randomBytes(8).toString('hex')}`;
    // The stub-checkout page (next file) auto-completes the payment
    // after a short delay. The frontend redirects there; user sees a
    // simulated success page; webhook fires; order flips to PAID.
    const apiBase = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
    const checkoutUrl = `${apiBase}/api/payments/stub-checkout/${gatewayRef}?cb=${encodeURIComponent(args.callbackUrl)}`;
    logger.info('stub_gateway.init', { gatewayRef, amount: args.amount, currency: args.currency });
    return {
      gatewayRef,
      checkoutUrl,
      rawPayload: {
        provider: 'stub',
        amount: args.amount,
        currency: args.currency,
      },
    };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome> {
    const sig = headers['x-stub-signature'];
    if (!sig) return { status: 'IGNORED', reason: 'Missing X-Stub-Signature header' };
    const expected = createHmac('sha256', STUB_SECRET).update(rawBody).digest('hex');
    if (sig !== expected) return { status: 'IGNORED', reason: 'Bad signature' };

    let payload: { gatewayRef?: string; status?: string };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return { status: 'IGNORED', reason: 'Body is not JSON' };
    }
    if (!payload.gatewayRef) return { status: 'IGNORED', reason: 'Missing gatewayRef' };

    return {
      status: payload.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
      gatewayRef: payload.gatewayRef,
      rawPayload: payload as Record<string, unknown>,
    };
  }

  async verify(gatewayRef: string): Promise<WebhookOutcome> {
    return {
      status: 'SUCCEEDED',
      gatewayRef,
      rawPayload: { provider: 'stub', via: 'verify' },
    };
  }
}

export function signStubBody(body: string): string {
  return createHmac('sha256', STUB_SECRET).update(body).digest('hex');
}
