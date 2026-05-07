import { randomBytes, timingSafeEqual } from 'node:crypto';
import { logger } from '@/infra/logger';
import type { InitArgs, InitResult, PaymentGateway, WebhookOutcome } from './gateway';

/**
 * Phase 10.2 — Flutterwave provider adapter.
 *
 * Flutterwave is a strong fit for Afrizonemart's pan-African scope —
 * native NGN, GHS, KES, UGX, TZS, ZAR, XAF, XOF, RWF, ZMW alongside
 * USD/EUR/GBP. One Flutterwave account covers the whole continent.
 *
 * Differences from the Squad adapter to be aware of:
 *  - **Single base URL** for sandbox + live; the test vs live split
 *    happens via the secret key prefix (FLWSECK_TEST- vs FLWSECK-).
 *    `hasEnvironments` is therefore `false` in the registry.
 *  - **Major units** for amount, NOT minor. Flutterwave's docs accept
 *    "100" (₦100) or "100.50" — we pass our Naira whole units straight
 *    through.
 *  - **Webhook verification** is a plain shared-secret comparison
 *    (`verif-hash` header == the `secret_hash` set in the FW dashboard).
 *    No HMAC of the body. We require admin to copy the same value
 *    into the `secretHash` credential field on this provider.
 *  - **Verify endpoint** uses our merchant `tx_ref` (no need to store
 *    Flutterwave's internal id) via `/v3/transactions/verify_by_reference`.
 */

const FLW_BASE = 'https://api.flutterwave.com';

interface FlwInitResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    link: string;
  };
}

interface FlwVerifyResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    /// Flutterwave transaction status. We treat 'successful' as paid;
    /// 'failed' / 'cancelled' as terminal failures; everything else as
    /// non-terminal (IGNORED).
    status: 'successful' | 'failed' | 'cancelled' | 'pending' | string;
    tx_ref: string;
    flw_ref?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string; name?: string };
  };
}

export class FlutterwaveGateway implements PaymentGateway {
  readonly id = 'flutterwave';

  constructor(
    private readonly secretKey: string,
    /// Webhook shared secret — must match the Secret Hash configured
    /// in the Flutterwave dashboard's webhook settings.
    private readonly secretHash: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async init(args: InitArgs): Promise<InitResult> {
    // Generate our own merchant reference; appears in the Flutterwave
    // dashboard so support can triage by order number.
    const txRef = `${args.orderNumber}-${randomBytes(4).toString('hex').toUpperCase()}`;

    const body = {
      tx_ref: txRef,
      amount: args.amount,
      currency: args.currency.toUpperCase(),
      redirect_url: args.callbackUrl,
      customer: {
        email: args.customerEmail,
        name: args.customerName ?? args.customerEmail,
      },
      customizations: {
        title: 'Afrizonemart',
        description: `Order ${args.orderNumber}`,
      },
      meta: {
        orderId: args.orderId,
        orderNumber: args.orderNumber,
      },
    };

    const res = await fetch(`${FLW_BASE}/v3/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    let json: FlwInitResponse;
    try {
      json = (await res.json()) as FlwInitResponse;
    } catch {
      throw new Error(`Flutterwave init failed: HTTP ${res.status} (non-JSON body)`);
    }

    if (!res.ok || json.status !== 'success' || !json.data?.link) {
      throw new Error(
        `Flutterwave init failed: ${json.message ?? `HTTP ${res.status}`}`,
      );
    }

    return {
      gatewayRef: txRef,
      checkoutUrl: json.data.link,
      rawPayload: json.data as unknown as Record<string, unknown>,
    };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome> {
    // Flutterwave delivers a static `verif-hash` header that matches
    // the Secret Hash configured in their dashboard. We require the
    // admin to copy the same value into the `secretHash` credential.
    const sig = headers['verif-hash'] ?? headers['x-flw-secret-hash'];
    if (!sig) return { status: 'IGNORED', reason: 'Missing verif-hash header' };
    // Phase 11.3 (audit H2): constant-time compare. Plain `!==`
    // leaks the shared secret character by character via timing.
    const a = Buffer.from(sig);
    const b = Buffer.from(this.secretHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn('flutterwave.webhook_bad_signature');
      return { status: 'IGNORED', reason: 'Bad signature' };
    }

    let payload: {
      event?: string;
      data?: {
        tx_ref?: string;
        status?: string;
        flw_ref?: string;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { status: 'IGNORED', reason: 'Body not JSON' };
    }

    const ref = payload.data?.tx_ref;
    const statusStr = (payload.data?.status ?? '').toLowerCase();
    if (!ref) return { status: 'IGNORED', reason: 'Missing tx_ref in payload' };

    if (statusStr === 'successful') {
      return { status: 'SUCCEEDED', gatewayRef: ref, rawPayload: payload as Record<string, unknown> };
    }
    if (statusStr === 'failed' || statusStr === 'cancelled') {
      return { status: 'FAILED', gatewayRef: ref, rawPayload: payload as Record<string, unknown> };
    }
    return { status: 'IGNORED', reason: `Non-terminal status: ${statusStr}` };
  }

  async verify(gatewayRef: string): Promise<WebhookOutcome> {
    const url = `${FLW_BASE}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(gatewayRef)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });

    let json: FlwVerifyResponse;
    try {
      json = (await res.json()) as FlwVerifyResponse;
    } catch {
      throw new Error(`Flutterwave verify failed: HTTP ${res.status} (non-JSON body)`);
    }

    if (!res.ok || json.status !== 'success' || !json.data) {
      // Often "transaction not found" before the user finishes
      // checkout — treat as IGNORED so the caller retries.
      return { status: 'IGNORED', reason: json.message ?? `HTTP ${res.status}` };
    }

    const statusStr = (json.data.status ?? '').toLowerCase();
    if (statusStr === 'successful') {
      return {
        status: 'SUCCEEDED',
        gatewayRef,
        rawPayload: json.data as unknown as Record<string, unknown>,
      };
    }
    if (statusStr === 'failed' || statusStr === 'cancelled') {
      return {
        status: 'FAILED',
        gatewayRef,
        rawPayload: json.data as unknown as Record<string, unknown>,
      };
    }
    return { status: 'IGNORED', reason: `Non-terminal status: ${statusStr}` };
  }
}
