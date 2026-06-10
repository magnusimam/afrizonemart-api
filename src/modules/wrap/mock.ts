/**
 * Deterministic mock-data generator for the Wrap.
 *
 * Used by the admin live-demo page so designers + ops can preview
 * the deck without needing a real user with 3+ qualifying orders
 * in the DB. NEVER touches Prisma — pure synthesis from a small set
 * of persona knobs to a fully-valid `WrappedStatsV1`.
 *
 * The numbers are plausible but synthetic. Picked so each card
 * has something visually interesting to render (no empty bars,
 * no collapsed pies).
 */

import type { WrappedPersonality, WrappedStatsV1 } from './types';

export interface MockWrapInput {
  personality: WrappedPersonality;
  /// ISO-2 of the customer's home country. Drives diaspora framing.
  homeCountry?: string | null;
  /// Total order count for the year. Defaults per persona.
  totalOrders?: number;
}

/// Curated archetypes the demo personalises around. Country codes
/// kept ISO-2; names mirror src/lib/countries server-side.
interface PersonaTemplate {
  reason: string;
  defaultHome: string | null;
  defaultOrders: number;
  /// Ordered list of origin countries to render; sharePct computed.
  origins: Array<{ code: string; name: string; weight: number }>;
  carePackagesPct: number;
  carePackageDestinations: string[];
  categories: Array<{ slug: string; name: string; weight: number }>;
  sellers: Array<{ brand: string; country: string; weight: number }>;
  tier: WrappedStatsV1['loyalty']['finalTier'];
  percentileRank: number;
  coinsEarned: number;
  coinsRedeemedNgn: number;
  /// Cultural seasonality knobs — fraction of orders in each special week.
  culturalMix: { eid: number; independence: number; christmas: number };
  /// Bias for monthly histogram. 12 weights, sum normalised.
  monthlyWeights: number[];
  discoveries: WrappedStatsV1['discoveries'];
}

const TEMPLATES: Record<WrappedPersonality, PersonaTemplate> = {
  CONNECTOR: {
    reason: 'You sent more care packages than most shoppers this year.',
    defaultHome: 'GB',
    defaultOrders: 14,
    origins: [
      { code: 'NG', name: 'Nigeria', weight: 7 },
      { code: 'GH', name: 'Ghana', weight: 3 },
      { code: 'KE', name: 'Kenya', weight: 2 },
      { code: 'ZA', name: 'South Africa', weight: 1 },
      { code: 'CI', name: "Côte d'Ivoire", weight: 1 },
    ],
    carePackagesPct: 0.64,
    carePackageDestinations: ['NG', 'NG', 'NG', 'GH'],
    categories: [
      { slug: 'beauty', name: 'Beauty & Personal Care', weight: 5 },
      { slug: 'groceries', name: 'Groceries', weight: 4 },
      { slug: 'books', name: 'Books', weight: 2 },
      { slug: 'fashion', name: 'Fashion', weight: 2 },
      { slug: 'home', name: 'Home Essentials', weight: 1 },
    ],
    sellers: [
      { brand: 'Aso Naturals', country: 'Nigeria', weight: 3 },
      { brand: 'Adinkra Skincare', country: 'Ghana', weight: 2 },
      { brand: 'Highlands Tea Co.', country: 'Kenya', weight: 2 },
    ],
    tier: 'GOLD',
    percentileRank: 85,
    coinsEarned: 4200,
    coinsRedeemedNgn: 8400,
    culturalMix: { eid: 0.08, independence: 0.2, christmas: 0.3 },
    monthlyWeights: [1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 1, 3],
    discoveries: [
      {
        productSlug: 'tom-brown-cereal',
        productName: 'Tom Brown Cereal',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
      {
        productSlug: 'ankara-maxi-wrap',
        productName: 'Ankara Maxi Wrap',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
      {
        productSlug: 'handwoven-yam-basket',
        productName: 'Hand-woven Yam Basket',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
    ],
  },

  PATRIOT: {
    reason: 'You went deep on a single country this year.',
    defaultHome: 'NG',
    defaultOrders: 18,
    origins: [
      { code: 'NG', name: 'Nigeria', weight: 15 },
      { code: 'GH', name: 'Ghana', weight: 2 },
      { code: 'KE', name: 'Kenya', weight: 1 },
    ],
    carePackagesPct: 0.05,
    carePackageDestinations: ['NG'],
    categories: [
      { slug: 'groceries', name: 'Groceries', weight: 7 },
      { slug: 'beauty', name: 'Beauty & Personal Care', weight: 4 },
      { slug: 'fashion', name: 'Fashion', weight: 3 },
      { slug: 'home', name: 'Home Essentials', weight: 2 },
      { slug: 'books', name: 'Books', weight: 2 },
    ],
    sellers: [
      { brand: 'Lagos Honey Co.', country: 'Nigeria', weight: 5 },
      { brand: 'Kano Spice House', country: 'Nigeria', weight: 4 },
      { brand: 'Aba Made Apparel', country: 'Nigeria', weight: 3 },
    ],
    tier: 'PLATINUM',
    percentileRank: 96,
    coinsEarned: 7800,
    coinsRedeemedNgn: 15600,
    culturalMix: { eid: 0.12, independence: 0.28, christmas: 0.22 },
    monthlyWeights: [1, 1, 1, 1, 2, 1, 1, 1, 1, 4, 2, 3],
    discoveries: [
      {
        productSlug: 'aso-oke-headtie',
        productName: 'Aso Oke Headtie',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
      {
        productSlug: 'ofada-rice-1kg',
        productName: 'Ofada Rice 1kg',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
    ],
  },

  EXPLORER: {
    reason: 'You shopped from across the continent this year.',
    defaultHome: 'KE',
    defaultOrders: 21,
    origins: [
      { code: 'NG', name: 'Nigeria', weight: 5 },
      { code: 'GH', name: 'Ghana', weight: 4 },
      { code: 'KE', name: 'Kenya', weight: 4 },
      { code: 'ZA', name: 'South Africa', weight: 3 },
      { code: 'MA', name: 'Morocco', weight: 2 },
      { code: 'EG', name: 'Egypt', weight: 2 },
      { code: 'SN', name: 'Senegal', weight: 1 },
    ],
    carePackagesPct: 0.1,
    carePackageDestinations: ['UG', 'TZ'],
    categories: [
      { slug: 'beauty', name: 'Beauty & Personal Care', weight: 5 },
      { slug: 'home', name: 'Home Essentials', weight: 4 },
      { slug: 'fashion', name: 'Fashion', weight: 4 },
      { slug: 'books', name: 'Books', weight: 4 },
      { slug: 'groceries', name: 'Groceries', weight: 4 },
    ],
    sellers: [
      { brand: 'Marrakech Argan', country: 'Morocco', weight: 3 },
      { brand: 'Cape Bean Roasters', country: 'South Africa', weight: 3 },
      { brand: 'Nairobi Naturals', country: 'Kenya', weight: 3 },
    ],
    tier: 'GOLD',
    percentileRank: 78,
    coinsEarned: 3600,
    coinsRedeemedNgn: 4200,
    culturalMix: { eid: 0.1, independence: 0.16, christmas: 0.22 },
    monthlyWeights: [2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
    discoveries: [
      {
        productSlug: 'argan-oil-100ml',
        productName: 'Argan Oil 100ml',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
      {
        productSlug: 'rooibos-loose-leaf',
        productName: 'Rooibos Loose Leaf 200g',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
      {
        productSlug: 'kente-throw',
        productName: 'Kente Throw Blanket',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
    ],
  },

  CURATOR: {
    reason: 'A small, specific catalog of things you genuinely love.',
    defaultHome: 'NG',
    defaultOrders: 6,
    origins: [
      { code: 'NG', name: 'Nigeria', weight: 4 },
      { code: 'GH', name: 'Ghana', weight: 2 },
    ],
    carePackagesPct: 0.1,
    carePackageDestinations: ['GH'],
    categories: [
      { slug: 'books', name: 'Books', weight: 3 },
      { slug: 'beauty', name: 'Beauty & Personal Care', weight: 2 },
      { slug: 'home', name: 'Home Essentials', weight: 1 },
    ],
    sellers: [
      { brand: 'Cassava Republic Press', country: 'Nigeria', weight: 3 },
      { brand: 'Ouida Books', country: 'Nigeria', weight: 1 },
    ],
    tier: 'SILVER',
    percentileRank: 42,
    coinsEarned: 1100,
    coinsRedeemedNgn: 0,
    culturalMix: { eid: 0, independence: 0.16, christmas: 0.16 },
    monthlyWeights: [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    discoveries: [
      {
        productSlug: 'beasts-of-no-nation',
        productName: 'Beasts of No Nation (Iweala)',
        productImage: null,
        why: 'Top-rated by other shoppers since you bought it.',
      },
    ],
  },
};

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  CI: "Côte d'Ivoire",
  GB: 'United Kingdom',
  US: 'United States',
  MA: 'Morocco',
  EG: 'Egypt',
  SN: 'Senegal',
  UG: 'Uganda',
  TZ: 'Tanzania',
};

/**
 * Builds a fully-populated `WrappedStatsV1` from a persona spec.
 * The result is shaped exactly like real aggregation output so
 * the v2 renderer doesn't need a separate code path.
 */
export function buildMockWrapStats(input: MockWrapInput): WrappedStatsV1 {
  const t = TEMPLATES[input.personality];
  const totalOrders = clampInt(
    input.totalOrders ?? t.defaultOrders,
    3,
    99,
  );
  const homeCountry =
    input.homeCountry === undefined ? t.defaultHome : input.homeCountry;

  /// Normalise origin weights to share% summing to ~100, and
  /// derive an orderCount that totals close to `totalOrders`.
  const originWeightSum = t.origins.reduce((s, o) => s + o.weight, 0);
  const topOriginCountries = t.origins.map((o) => {
    const share = o.weight / originWeightSum;
    return {
      code: o.code,
      name: o.name,
      orderCount: Math.max(1, Math.round(share * totalOrders)),
      sharePct: Math.round(share * 100),
    };
  });

  /// Care packages: a target count derived from carePackagesPct,
  /// capped at totalOrders.
  const carePackagesCount = Math.min(
    totalOrders,
    Math.round(totalOrders * t.carePackagesPct),
  );

  /// Categories: same normalisation pattern as origins.
  const catWeightSum = t.categories.reduce((s, c) => s + c.weight, 0);
  const topCategories = t.categories.map((c) => {
    const share = c.weight / catWeightSum;
    return {
      slug: c.slug,
      name: c.name,
      orderCount: Math.max(1, Math.round(share * totalOrders)),
      sharePct: Math.round(share * 100),
    };
  });

  /// Sellers: at most 3, weighted.
  const topSellers = t.sellers.slice(0, 3).map((s) => ({
    brand: s.brand,
    country: s.country,
    orderCount: Math.max(1, Math.round((s.weight / 10) * totalOrders)),
  }));

  /// Cultural: special-week counts as a fraction of totalOrders.
  const eidWeekOrders = Math.round(t.culturalMix.eid * totalOrders);
  const independenceDayWeekOrders = Math.round(
    t.culturalMix.independence * totalOrders,
  );
  const christmasWeekOrders = Math.round(t.culturalMix.christmas * totalOrders);

  /// Monthly histogram: distribute by weights, force total to match.
  const monthlyOrderCounts = normaliseMonthly(t.monthlyWeights, totalOrders);
  const busiest = pickMonth(monthlyOrderCounts, 'max');
  const quietest = pickMonth(monthlyOrderCounts, 'min');

  /// Brand-string proxy for small businesses (matches aggregation.ts).
  const smallBusinessesSupported = Math.min(
    t.sellers.length + Math.max(0, Math.round(totalOrders / 3) - t.sellers.length),
    totalOrders,
  );

  const stats: WrappedStatsV1 = {
    version: 1,
    personality: input.personality,
    personalityReason: t.reason,
    totalOrders,
    totalProducts: Math.round(totalOrders * 1.6),
    uniqueCategoriesCount: t.categories.length,
    uniqueCountriesCount: t.origins.length,
    homeCountry,
    topOriginCountries,
    carePackagesCount,
    carePackageDestinations: t.carePackageDestinations,
    topCategories,
    cultural: {
      eidWeekOrders,
      independenceDayWeekOrders,
      christmasWeekOrders,
      busiestMonth: { month: busiest.month, orders: busiest.orders },
      quietestMonth: { month: quietest.month, orders: quietest.orders },
      monthlyOrderCounts,
    },
    smallBusinessesSupported,
    topSellers,
    loyalty: {
      coinsEarned: t.coinsEarned,
      coinsRedeemedNgn: t.coinsRedeemedNgn,
      finalTier: t.tier,
      percentileRank: t.percentileRank,
    },
    discoveries: t.discoveries,
  };

  return stats;
}

/// Exposed so the v2 admin form can label country codes consistently
/// with how aggregation labels them in the real data path.
export function mockCountryName(code: string): string {
  return COUNTRY_NAME_BY_CODE[code] ?? code;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normaliseMonthly(weights: number[], total: number): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return Array(12).fill(0);
  const raw = weights.map((w) => (w / sum) * total);
  const rounded = raw.map((r) => Math.floor(r));
  let used = rounded.reduce((s, n) => s + n, 0);
  /// Distribute the remainder to the months with the largest
  /// fractional part — keeps the visual roughly proportional.
  const remainders = raw
    .map((r, i) => ({ idx: i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  let cursor = 0;
  while (used < total && cursor < remainders.length) {
    rounded[remainders[cursor].idx] += 1;
    used += 1;
    cursor += 1;
  }
  return rounded;
}

function pickMonth(
  counts: number[],
  mode: 'min' | 'max',
): { month: number; orders: number } {
  let bestIdx = 0;
  for (let i = 1; i < counts.length; i += 1) {
    if (mode === 'max' ? counts[i] > counts[bestIdx] : counts[i] < counts[bestIdx]) {
      bestIdx = i;
    }
  }
  return { month: bestIdx + 1, orders: counts[bestIdx] };
}
