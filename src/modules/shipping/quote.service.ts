import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { gigShippingProvider } from './providers/gig-logistics';
import { manualShippingProvider } from './providers/manual';
import {
  DEFAULT_PRODUCT_WEIGHT_KG,
  type ShippingDestination,
  type ShippingProvider,
  type ShippingQuote,
  type ShippingQuoteContext,
  type ShippingQuoteItem,
} from './providers/types';

/**
 * Phase 11 — Shipping quote facade.
 *
 * Walks every registered provider, concatenates their quotes, returns
 * one merged sorted list to the caller. Phase 1 only registers the
 * manual provider; Phase 2 plugs in GIG / DHL / Sendy / Kwik as
 * additional entries below — same shape, different file.
 */

/// Order matters: each provider's quotes are concatenated in this
/// order, then re-sorted by price + ETA before returning. Manual
/// stays last so even when carrier APIs go silent we always have
/// something to render.
const ACTIVE_PROVIDERS: ShippingProvider[] = [
  // Phase 2 carriers — each is a no-op until its env credentials are set.
  gigShippingProvider,
  // DHL, Sendy, Kwik land here as additional entries.
  manualShippingProvider,
];

export interface QuoteCartItemInput {
  productId: string;
  qty: number;
}

export interface GetQuotesArgs {
  destination: ShippingDestination;
  items: QuoteCartItemInput[];
}

/// Hydrates cart items with current product weight + price, then walks
/// every active provider. Each provider's failures (thrown errors,
/// rejected promises) are isolated — a broken carrier API doesn't take
/// down the rest of the list.
export async function getShippingQuotes(args: GetQuotesArgs): Promise<{
  quotes: ShippingQuote[];
  weightKg: number;
  subtotalNgn: number;
}> {
  if (args.items.length === 0) {
    return { quotes: [], weightKg: 0, subtotalNgn: 0 };
  }

  const productIds = Array.from(new Set(args.items.map((i) => i.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, weightKg: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const hydrated: ShippingQuoteItem[] = [];
  let subtotalNgn = 0;
  let weightKg = 0;
  for (const it of args.items) {
    const p = byId.get(it.productId);
    if (!p) continue; // skip unknown ids — caller already validated
    const unitWeight = p.weightKg ?? DEFAULT_PRODUCT_WEIGHT_KG;
    hydrated.push({
      productId: p.id,
      qty: it.qty,
      unitPriceNgn: p.price,
      weightKg: unitWeight,
    });
    subtotalNgn += p.price * it.qty;
    weightKg += unitWeight * it.qty;
  }

  const ctx: ShippingQuoteContext = {
    destination: args.destination,
    items: hydrated,
    subtotalNgn,
  };

  const settled = await Promise.allSettled(
    ACTIVE_PROVIDERS.map((p) => p.quote(ctx)),
  );
  const quotes: ShippingQuote[] = [];
  for (let i = 0; i < settled.length; i += 1) {
    const r = settled[i];
    const provider = ACTIVE_PROVIDERS[i];
    if (r.status === 'fulfilled') {
      quotes.push(...r.value);
    } else {
      logger.warn('shipping.provider_failed', {
        provider: provider.key,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  // Cheapest first; ties broken by faster ETA, then by label so the
  // order is deterministic across requests.
  quotes.sort((a, b) => {
    if (a.amountNgn !== b.amountNgn) return a.amountNgn - b.amountNgn;
    const aEta = a.etaDaysMin + a.etaDaysMax;
    const bEta = b.etaDaysMin + b.etaDaysMax;
    if (aEta !== bEta) return aEta - bEta;
    return a.label.localeCompare(b.label);
  });

  return { quotes, weightKg, subtotalNgn };
}
