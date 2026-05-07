import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import type {
  ShippingProvider,
  ShippingQuote,
  ShippingQuoteContext,
} from './types';

/**
 * Phase 11.2 — GIG Logistics provider.
 *
 * Returns live "GIG Standard" + "GIG Express" quotes from GIG Logistics'
 * pricing API alongside the manual rate card. GIG is Nigerian-first
 * with same-day inter-state coverage; great for the NG ↔ NG corridor.
 *
 * Configuration: requires `GIG_API_KEY`, `GIG_USERNAME`, `GIG_PASSWORD`
 * env vars. Without them this provider is a no-op (returns []) and
 * checkout falls through to the manual rate card.
 *
 * **NOTE (2026-05-07)**: GIG's docs are private until you sign a
 * carrier agreement. The `requestQuote` body shape below mirrors the
 * patterns from third-party integrations seen in the wild — the
 * exact field names will need a 5-minute touch-up against the real
 * GIG sandbox account once we have credentials. The rest of the
 * provider (env handling, fail-soft, timeout, logging) is correct.
 */

/// Current best-known endpoint. Update once GIG provisions us.
const GIG_QUOTE_URL =
  process.env.GIG_QUOTE_URL ?? 'https://api.giglogistics.com/v1/pricing/quote';

/// Cap how long we wait for GIG before giving up + returning [] so
/// the manual provider has a chance to respond. Carrier APIs are the
/// usual culprit when checkouts time out.
const GIG_TIMEOUT_MS = 4000;

interface GigQuoteResponse {
  data?: Array<{
    serviceId?: string;
    serviceName?: string;
    /// Naira cost (carrier returns it in the customer's currency
    /// when the destination is NG; we don't currently support GIG
    /// for non-NG destinations).
    amount?: number;
    estimatedDeliveryDays?: number;
    /// Some endpoints return a range; either is fine.
    minDeliveryDays?: number;
    maxDeliveryDays?: number;
  }>;
  error?: { message?: string };
}

function isConfigured(): boolean {
  return Boolean(
    env.GIG_API_KEY && env.GIG_USERNAME && env.GIG_PASSWORD,
  );
}

async function requestQuote(ctx: ShippingQuoteContext): Promise<ShippingQuote[]> {
  // GIG is Nigerian-first; we don't ship via them outside NG today.
  // When the Nigerian-only assumption changes, drop this guard.
  if (ctx.destination.country.toUpperCase() !== 'NG') return [];

  const totalWeightKg = ctx.items.reduce(
    (acc, it) => acc + it.weightKg * it.qty,
    0,
  );

  const body = {
    sender: {
      city: env.GIG_ORIGIN_CITY,
      state: env.GIG_ORIGIN_STATE,
    },
    receiver: {
      city: ctx.destination.city ?? '',
      state: ctx.destination.state ?? ctx.destination.city ?? '',
      address: ctx.destination.addressLine ?? '',
    },
    parcel: {
      weightKg: Number(totalWeightKg.toFixed(2)),
      declaredValueNgn: ctx.subtotalNgn,
      // Default; GIG uses dimensional weight too. Future enhancement:
      // pass real L/W/H once we add those product columns.
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GIG_TIMEOUT_MS);

  try {
    const res = await fetch(GIG_QUOTE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GIG_API_KEY}`,
        'X-Username': env.GIG_USERNAME ?? '',
        'X-Password': env.GIG_PASSWORD ?? '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn('shipping.gig.http_error', { status: res.status });
      return [];
    }

    const json = (await res.json()) as GigQuoteResponse;
    if (!json.data || json.data.length === 0) return [];

    return json.data
      .filter((q) => typeof q.amount === 'number' && q.amount > 0)
      .map((q): ShippingQuote => {
        const min = q.minDeliveryDays ?? q.estimatedDeliveryDays ?? 1;
        const max = q.maxDeliveryDays ?? q.estimatedDeliveryDays ?? min;
        return {
          provider: 'gig',
          rateId: null,
          label: q.serviceName ? `GIG ${q.serviceName}` : 'GIG Logistics',
          amountNgn: Math.round(q.amount as number),
          etaDaysMin: min,
          etaDaysMax: max,
          reason: `GIG ${q.serviceId ?? 'standard'} · ${totalWeightKg.toFixed(2)}kg to ${ctx.destination.city ?? '?'}`,
        };
      });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      logger.warn('shipping.gig.timeout', { timeoutMs: GIG_TIMEOUT_MS });
    } else {
      logger.warn('shipping.gig.failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const gigShippingProvider: ShippingProvider = {
  key: 'gig',
  label: 'GIG Logistics',
  async quote(ctx) {
    if (!isConfigured()) return [];
    return requestQuote(ctx);
  },
};
