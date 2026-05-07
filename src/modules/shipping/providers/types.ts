/**
 * Phase 11 — Shipping provider contract.
 *
 * Every quote source (manual rate cards, GIG Logistics API, DHL,
 * Sendy, Kwik, …) implements this interface. The quote service walks
 * the registered list at checkout and concatenates results, so
 * customers see "Standard ₦2,500 (3-5 days)" + "GIG Express ₦4,200
 * (next day)" + "DHL ₦18,000 (2-3 days)" side by side.
 *
 * Mirrors the shape of `payments/registry.ts` so adding a new carrier
 * is one new file + one entry in `ACTIVE_PROVIDERS`.
 */

/// Default chargeable weight when a product hasn't had `weightKg`
/// set yet. Small package — pessimistic enough not to undercharge,
/// generous enough not to scare customers.
export const DEFAULT_PRODUCT_WEIGHT_KG = 0.5;

export interface ShippingDestination {
  /// ISO-2 country code (e.g. 'NG', 'KE'). Required.
  country: string;
  /// Free-form city name as the customer typed it. Optional.
  /// Carrier APIs may need this for regional pricing; the manual
  /// provider also uses it to match flagship-city zones.
  city?: string;
  /// Optional state/region — used by some carriers (DHL needs a
  /// US-style state code; Nigerian APIs sometimes need a state name).
  state?: string;
  /// Optional postcode — same story.
  postcode?: string;
  /// First line of street address. Some carrier APIs require it for
  /// even a quote. Manual provider ignores it.
  addressLine?: string;
}

export interface ShippingQuoteItem {
  productId: string;
  qty: number;
  /// Naira whole units. Used for free-shipping threshold checks.
  unitPriceNgn: number;
  /// Per-unit weight in kg. Caller has already substituted the
  /// default for products with null weights.
  weightKg: number;
}

export interface ShippingQuoteContext {
  destination: ShippingDestination;
  items: ShippingQuoteItem[];
  /// Whole cart subtotal in Naira (sum of unitPriceNgn × qty), passed
  /// in so providers don't all recompute it. Used by `freeAboveAmount`
  /// thresholds + by carriers that price by declared value.
  subtotalNgn: number;
}

export interface ShippingQuote {
  /// Stable provider key — `'manual'`, `'gig'`, etc. Stored on the
  /// Order so fulfilment knows which carrier to book.
  provider: string;
  /// Provider-side rate id when the rate is persisted on our side
  /// (manual provider returns ShippingRate.id). Null for live carrier
  /// quotes that aren't backed by a row.
  rateId: string | null;
  /// Customer-facing label, e.g. "Lagos Standard", "GIG Express".
  label: string;
  /// Final price in Naira whole units.
  amountNgn: number;
  /// Inclusive ETA range; render as "3-5 days" or just "5 days" when
  /// min == max.
  etaDaysMin: number;
  etaDaysMax: number;
  /// Optional debug/audit string explaining how this rate was picked.
  /// e.g. "zone=Lagos · 1.5kg in [1, 5)kg bracket · subtotal under 15k"
  reason?: string;
}

export interface ShippingProvider {
  /// Stable identifier; matches the Order.shippingProvider column.
  key: string;
  /// Human-friendly display name for the admin.
  label: string;
  /// Returns zero or more quote options for the cart. Should never
  /// throw under normal failures (rate API down, etc.) — return []
  /// and let the manual fallback do the work.
  quote(ctx: ShippingQuoteContext): Promise<ShippingQuote[]>;
}
