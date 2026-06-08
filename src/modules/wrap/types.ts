/**
 * Versioned stats shape for the Afrizonemart Wrap.
 *
 * Stored as JSON on WrappedSnapshot.stats. Versioned so the deck
 * design can evolve year-over-year without re-aggregating
 * historical snapshots — the renderer parses, falls back when
 * fields are missing, and degrades gracefully on old shapes.
 *
 * Keep this file in sync with the matching client-side type in
 * `afrizonemart-v2/src/lib/api/wrap.ts` once that file is added
 * (PR 4 in the WRAP_TRACKER timeline).
 */

export type WrappedPersonality =
  | 'CONNECTOR'   // diaspora pattern: 40%+ of orders ship abroad
  | 'PATRIOT'     // 70%+ of orders from a single origin country
  | 'EXPLORER'    // 4+ different origin countries in the year
  | 'CURATOR';    // default — smaller, specific catalog of items

export interface WrappedStatsV1 {
  version: 1;

  // ── Identity / personality ──────────────────────────────────────
  personality: WrappedPersonality;
  personalityReason: string;

  // ── Volume (no money totals; intentional — see WRAP_TRACKER §1) ─
  totalOrders: number;
  totalProducts: number;
  uniqueCategoriesCount: number;
  uniqueCountriesCount: number;

  // ── Geography ───────────────────────────────────────────────────
  /// Customer's resolved home country (best-guess from their
  /// most-recent default address, fallback to most-frequent
  /// shipping country, fallback to null).
  homeCountry: string | null;
  topOriginCountries: Array<{
    code: string;
    name: string;
    orderCount: number;
    sharePct: number;
  }>;

  // ── Diaspora / care packages ────────────────────────────────────
  /// Orders shipped to a country other than the user's homeCountry.
  /// Drives the Connector card.
  carePackagesCount: number;
  carePackageDestinations: string[];  // ISO-2 codes

  // ── Categories ──────────────────────────────────────────────────
  topCategories: Array<{
    slug: string;
    name: string;
    orderCount: number;
    sharePct: number;
  }>;

  // ── Cultural moments ────────────────────────────────────────────
  cultural: {
    eidWeekOrders: number;
    independenceDayWeekOrders: number;
    christmasWeekOrders: number;
    busiestMonth: { month: number; orders: number };
    quietestMonth: { month: number; orders: number };
    monthlyOrderCounts: number[];  // length 12, Jan first
  };

  // ── Impact ──────────────────────────────────────────────────────
  /// Number of distinct sellers/brands the customer bought from.
  /// v1: brand-string proxy (Product.brand). See WRAP_TRACKER §6.1.
  smallBusinessesSupported: number;
  topSellers: Array<{
    brand: string;
    country: string | null;
    orderCount: number;
  }>;

  // ── Loyalty ─────────────────────────────────────────────────────
  loyalty: {
    coinsEarned: number;
    coinsRedeemedNgn: number;
    finalTier: 'BLUE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    percentileRank: number;  // 0-100 — top X% of earners this year
  };

  // ── Discoveries ─────────────────────────────────────────────────
  /// Products the customer bought that later became crowd favourites
  /// (rating >= 4.5 AND reviewCount >= 10). Up to 3. Card is hidden
  /// if zero qualify.
  discoveries: Array<{
    productSlug: string;
    productName: string;
    productImage: string | null;
    why: string;  // copy explaining why it's a discovery
  }>;
}
