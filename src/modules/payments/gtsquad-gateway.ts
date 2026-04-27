import { createHmac, randomBytes } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import type { InitArgs, InitResult, PaymentGateway, WebhookOutcome } from './gateway';

const SANDBOX_BASE = 'https://sandbox-api-d.squadco.com';
const LIVE_BASE = 'https://api-d.squadco.com';

interface SquadInitResponse {
  status: number;
  message: string;
  data: {
    checkout_url: string;
    transaction_ref: string;
    transaction_amount?: number;
    currency?: string;
  };
}

interface SquadVerifyResponse {
  status: number;
  success: boolean;
  message: string;
  data: {
    transaction_amount: number;
    transaction_ref: string;
    transaction_status: 'Success' | 'Failed' | 'Abandoned' | 'Pending' | string;
    transaction_currency_id: string;
    gateway_transaction_ref?: string;
    email?: string;
  };
}

/**
 * Squad gateway adapter (squadco.com).
 *
 * Activated when both SQUAD_SECRET_KEY and SQUAD_ENVIRONMENT are set.
 * Otherwise the StubGateway handles things for local dev.
 *
 * Notes:
 * - Squad amounts are in **kobo / cents** (₦100 = 10000). We multiply
 *   our Naira whole-unit amounts by 100 on the way in and divide by
 *   100 on the way out for sanity-checks.
 * - Webhook signature is HMAC-SHA512 of the raw body, hex UPPERCASE,
 *   delivered in the `x-squad-encrypted-body` header.
 * - We use our own merchant `transaction_ref` so we can find the
 *   matching Payment row by gatewayRef without storing Squad's
 *   counterpart separately.
 */
export class GtSquadGateway implements PaymentGateway {
  readonly id = 'squad';

  constructor(
    private readonly secret: string,
    private readonly environment: 'sandbox' | 'live',
  ) {}

  private get baseUrl(): string {
    return this.environment === 'live' ? LIVE_BASE : SANDBOX_BASE;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async init(args: InitArgs): Promise<InitResult> {
    // Squad expects amounts in kobo (NGN) or cents (USD). Our system
    // stores Naira whole units. Multiply by 100.
    const amountMinor = args.amount * 100;
    // Generate our own merchant reference. Order number prefix +
    // random suffix — readable in Squad's dashboard for support
    // triage.
    const transactionRef = `${args.orderNumber}-${randomBytes(4).toString('hex').toUpperCase()}`;

    const body = {
      amount: amountMinor,
      email: args.customerEmail,
      currency: args.currency.toUpperCase(),
      initiate_type: 'inline',
      transaction_ref: transactionRef,
      customer_name: args.customerName ?? args.customerEmail,
      callback_url: args.callbackUrl,
      payment_channels: ['card', 'bank', 'ussd', 'transfer'],
      metadata: {
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      },
    };

    const res = await fetch(`${this.baseUrl}/transaction/initiate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    let json: SquadInitResponse | { message?: string };
    try {
      json = (await res.json()) as SquadInitResponse;
    } catch {
      throw new Error(`Squad init failed: HTTP ${res.status} (non-JSON body)`);
    }
    if (!res.ok || (json as SquadInitResponse).status !== 200) {
      throw new Error(
        `Squad init failed: ${(json as { message?: string }).message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (json as SquadInitResponse).data;
    return {
      gatewayRef: data.transaction_ref,
      checkoutUrl: data.checkout_url,
      rawPayload: data as unknown as Record<string, unknown>,
    };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome> {
    const sig = headers['x-squad-encrypted-body'];
    if (!sig) return { status: 'IGNORED', reason: 'Missing x-squad-encrypted-body' };

    const expected = createHmac('sha512', this.secret).update(rawBody).digest('hex').toUpperCase();
    if (sig.toUpperCase() !== expected) {
      logger.warn('squad.webhook_bad_signature');
      return { status: 'IGNORED', reason: 'Bad signature' };
    }

    let payload: {
      Event?: string;
      TransactionRef?: string;
      Body?: {
        transaction_ref?: string;
        transaction_status?: string;
        gateway_ref?: string;
        amount?: number;
        currency?: string;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { status: 'IGNORED', reason: 'Body not JSON' };
    }

    const inner = payload.Body ?? {};
    const ref = inner.transaction_ref ?? payload.TransactionRef;
    const statusStr = (inner.transaction_status ?? '').toLowerCase();
    if (!ref) return { status: 'IGNORED', reason: 'Missing transaction_ref in payload' };

    if (statusStr === 'success') {
      return { status: 'SUCCEEDED', gatewayRef: ref, rawPayload: payload as Record<string, unknown> };
    }
    if (statusStr === 'failed' || statusStr === 'abandoned') {
      return { status: 'FAILED', gatewayRef: ref, rawPayload: payload as Record<string, unknown> };
    }
    // Pending or unknown — don't flip the order yet.
    return { status: 'IGNORED', reason: `Non-terminal status: ${statusStr}` };
  }

  async verify(gatewayRef: string): Promise<WebhookOutcome> {
    const res = await fetch(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(gatewayRef)}`,
      {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    let json: SquadVerifyResponse | { message?: string };
    try {
      json = (await res.json()) as SquadVerifyResponse;
    } catch {
      throw new Error(`Squad verify failed: HTTP ${res.status} (non-JSON body)`);
    }

    if (!res.ok || !(json as SquadVerifyResponse).success) {
      // Verify endpoint returning a non-success isn't fatal — it
      // could mean "not yet settled". Treat as IGNORED so the
      // caller can retry.
      return {
        status: 'IGNORED',
        reason: (json as { message?: string }).message ?? `HTTP ${res.status}`,
      };
    }

    const data = (json as SquadVerifyResponse).data;
    const statusStr = (data.transaction_status ?? '').toLowerCase();
    if (statusStr === 'success') {
      return { status: 'SUCCEEDED', gatewayRef, rawPayload: data as unknown as Record<string, unknown> };
    }
    if (statusStr === 'failed' || statusStr === 'abandoned') {
      return { status: 'FAILED', gatewayRef, rawPayload: data as unknown as Record<string, unknown> };
    }
    return { status: 'IGNORED', reason: `Non-terminal status: ${statusStr}` };
  }
}
