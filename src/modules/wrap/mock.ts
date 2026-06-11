import type { WrappedPersonality, WrappedStatsV1 } from './types';

/**
 * Pure persona → WrappedStatsV1 synthesiser for the admin Live Demo
 * (`/admin/wrap/demo`) and the index-page preview fallbacks.
 *
 * **Never touches Prisma.** Given a persona archetype + a couple of
 * knobs it returns a fully-shaped, internally-consistent
 * `WrappedStatsV1` so stakeholders can see every card populated
 * before the Dec 1 drop — without seeding real orders.
 *
 * Deterministic: the same input always yields the same deck, so a
 * demo URL is stable and a slider drag doesn't reshuffle unrelated
 * cards. No `Math.random()`.
 *
 * Keep the output shape in lockstep with `computeUserWrap()` in
 * aggregation.ts — same fields, same value ranges — so the demo is
 * an honest preview of the renderer's real input.
 */

const MIN_ORDERS = 3;
const MAX_ORDERS = 50;

interface CountryRef {
  code: string;
  name: string;
}

/** African origin pool the synth draws goods from. Display names
 *  mirror aggregation.ts's COUNTRY_NAME for the same codes. */
const ORIGIN_POOL: CountryRef[] = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'MA', name: 'Morocco' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'SN', name: 'Senegal' },
];

const CATEGORY_POOL: Array<{ slug: string; name: string }> = [
  { slug: 'food-cupboard', name: 'Food Cupboard' },
  { slug: 'beauty-personal-care', name: 'Beauty & Personal Care' },
  { slug: 'fashion', name: 'Fashion' },
  { slug: 'beverages', name: 'Beverages' },
  { slug: 'spices-seasonings', name: 'Spices & Seasonings' },
  { slug: 'home-living', name: 'Home & Living' },
];

const SELLER_POOL: Array<{ brand: string; country: string }> = [
  { brand: 'Ola Foods', country: 'Nigeria' },
  { brand: 'Accra Naturals', country: 'Ghana' },
  { brand: 'Savanna Spice Co.', country: 'Kenya' },
  { brand: 'Cape Artisan', country: 'South Africa' },
  { brand: 'Habesha Roasters', country: 'Ethiopia' },
];

const DISCOVERY_POOL: WrappedStatsV1['discoveries'] = [
  {
    productSlug: 'jollof-rice-spice-blend',
    productName: 'Jollof Rice Spice Blend',
    productImage: null,
    why: 'Top-rated by other shoppers since you bought it.',
  },
  {
    productSlug: 'shea-butter-raw-unrefined',
    productName: 'Raw Unrefined Shea Butter',
    productImage: null,
    why: 'Became a crowd favourite after your order.',
  },
  {
    productSlug: 'ethiopian-yirgacheffe-coffee',
    productName: 'Ethiopian Yirgacheffe Coffee',
    productImage: null,
    why: '4.7★ across 40+ reviews — you found it early.',
  },
];

/**
 * Largest-remainder split of an integer total across weighted
 * buckets. Returned array sums to exactly `total`. Used for orders
 * across origins / categories / months so the mock's parts always
 * add up to the headline number.
 */
function distributeInt(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / weightSum) * total);
  const out = raw.map((r) => Math.floor(r));
  let remainder = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0 && order.length > 0; k++, remainder--) {
    out[order[k % order.length].i]++;
  }
  return out;
}

function clampOrders(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 12;
  return Math.min(MAX_ORDERS, Math.max(MIN_ORDERS, Math.round(n)));
}

/** Origin weights per persona — drives uniqueCountriesCount and the
 *  top-origin share that defines each archetype. */
function originWeights(persona: WrappedPersonality): number[] {
  switch (persona) {
    case 'PATRIOT':
      return [78, 14, 8];
    case 'EXPLORER':
      return [26, 23, 20, 17, 14];
    case 'CONNECTOR':
      return [44, 33, 23];
    case 'CURATOR':
    default:
      return [64, 36];
  }
}

/** Fraction of orders that ship to a country other than home. */
function carePackageShare(persona: WrappedPersonality): number {
  switch (persona) {
    case 'CONNECTOR':
      return 0.6;
    case 'EXPLORER':
      return 0.16;
    case 'CURATOR':
      return 0.1;
    case 'PATRIOT':
    default:
      return 0.05;
  }
}

function personalityReason(
  persona: WrappedPersonality,
  uniqueCountries: number,
): string {
  switch (persona) {
    case 'CONNECTOR':
      return 'You sent more care packages than 87% of buyers this year.';
    case 'PATRIOT':
      return "You stuck mostly to one country's makers all year.";
    case 'EXPLORER':
      return `You shopped from ${uniqueCountries} different African countries this year.`;
    case 'CURATOR':
    default:
      return 'You shopped with intent — fewer items, carefully chosen.';
  }
}

function tierForCoins(
  coins: number,
): 'BLUE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
  if (coins >= 4000) return 'PLATINUM';
  if (coins >= 2000) return 'GOLD';
  if (coins >= 800) return 'SILVER';
  return 'BLUE';
}

export interface MockWrapInput {
  personality: WrappedPersonality;
  homeCountry?: string | null;
  totalOrders?: number;
}

/**
 * Synthesise a WrappedStatsV1 for the given persona. Pure; no I/O.
 */
export function computeMockWrap(input: MockWrapInput): WrappedStatsV1 {
  const persona = input.personality;
  const totalOrders = clampOrders(input.totalOrders);
  const home = (input.homeCountry ?? null)?.toUpperCase() ?? null;

  // ── Origins ──────────────────────────────────────────────────────
  // Rotate the start of the pool by persona so each archetype shows a
  // distinct mix while staying deterministic.
  const rotate = ['CONNECTOR', 'PATRIOT', 'EXPLORER', 'CURATOR'].indexOf(
    persona,
  );
  const weights = originWeights(persona);
  const chosen = weights.map(
    (_, i) => ORIGIN_POOL[(rotate + i) % ORIGIN_POOL.length],
  );
  const originCounts = distributeInt(totalOrders, weights);
  const topOriginCountries = chosen
    .map((c, i) => ({
      code: c.code,
      name: c.name,
      orderCount: originCounts[i],
      sharePct: Math.round((originCounts[i] / totalOrders) * 100),
    }))
    .filter((o) => o.orderCount > 0)
    .sort((a, b) => b.orderCount - a.orderCount);
  const uniqueCountriesCount = topOriginCountries.length;

  // ── Care packages ────────────────────────────────────────────────
  const carePackagesCount = Math.min(
    totalOrders,
    Math.round(totalOrders * carePackageShare(persona)),
  );
  // Diaspora personas ship home goods abroad; rooted personas
  // occasionally send a package out. Destinations differ from home.
  const carePackageDestinations =
    carePackagesCount > 0
      ? persona === 'CONNECTOR'
        ? ['NG', 'GH']
        : ['GB']
      : [];

  // ── Categories ───────────────────────────────────────────────────
  const catCount = persona === 'CURATOR' ? 3 : persona === 'EXPLORER' ? 6 : 4;
  const catWeights = Array.from({ length: catCount }, (_, i) => catCount - i);
  const catOrderCounts = distributeInt(totalOrders, catWeights);
  const topCategories = Array.from({ length: catCount }, (_, i) => {
    const cat = CATEGORY_POOL[(rotate + i) % CATEGORY_POOL.length];
    return {
      slug: cat.slug,
      name: cat.name,
      orderCount: catOrderCounts[i],
      sharePct: Math.round((catOrderCounts[i] / totalOrders) * 100),
    };
  })
    .filter((c) => c.orderCount > 0)
    .sort((a, b) => b.orderCount - a.orderCount);
  const uniqueCategoriesCount = topCategories.length;

  // ── Cultural months ──────────────────────────────────────────────
  // Spikes at Mar (Eid), May (Eid al-Adha), Oct (Independence), Dec
  // (Christmas). Patriots over-index on Independence.
  const monthWeights = [3, 3, 6, 4, 6, 3, 3, 4, 4, persona === 'PATRIOT' ? 8 : 5, 4, 9];
  const monthlyOrderCounts = distributeInt(totalOrders, monthWeights);

  let busiestMonth = { month: 1, orders: -1 };
  let quietestMonth = { month: 1, orders: Infinity };
  for (let m = 0; m < 12; m++) {
    const c = monthlyOrderCounts[m];
    if (c > busiestMonth.orders) busiestMonth = { month: m + 1, orders: c };
    if (c < quietestMonth.orders) quietestMonth = { month: m + 1, orders: c };
  }
  if (quietestMonth.orders === Infinity) quietestMonth = { month: 1, orders: 0 };

  // Cultural-week counts are a slice of the spike months, never more
  // than that month actually held.
  const eidWeekOrders = Math.min(
    monthlyOrderCounts[2] + monthlyOrderCounts[4],
    Math.round(totalOrders * 0.1),
  );
  const independenceDayWeekOrders = Math.min(
    monthlyOrderCounts[9],
    Math.round(totalOrders * (persona === 'PATRIOT' ? 0.14 : 0.07)),
  );
  const christmasWeekOrders = Math.min(
    monthlyOrderCounts[11],
    Math.round(totalOrders * 0.15),
  );

  // ── Sellers / impact ─────────────────────────────────────────────
  const sellerCount = Math.min(SELLER_POOL.length, persona === 'CURATOR' ? 2 : 3);
  const sellerOrderCounts = distributeInt(
    Math.max(totalOrders, sellerCount),
    Array.from({ length: sellerCount }, (_, i) => sellerCount - i),
  );
  const topSellers = Array.from({ length: sellerCount }, (_, i) => {
    const s = SELLER_POOL[(rotate + i) % SELLER_POOL.length];
    return {
      brand: s.brand,
      country: s.country,
      orderCount: sellerOrderCounts[i],
    };
  }).sort((a, b) => b.orderCount - a.orderCount);
  const smallBusinessesSupported = Math.max(
    sellerCount,
    Math.round(totalOrders * 0.6),
  );

  // ── Loyalty ──────────────────────────────────────────────────────
  const coinsEarned = totalOrders * 120;
  const coinsRedeemedNgn = Math.round(totalOrders * 0.4) * 100;
  const finalTier = tierForCoins(coinsEarned);
  // More orders → higher percentile. Maps [MIN..MAX] → ~[40..98].
  const percentileRank = Math.min(
    98,
    Math.round(
      40 + ((totalOrders - MIN_ORDERS) / (MAX_ORDERS - MIN_ORDERS)) * 58,
    ),
  );

  // ── Discoveries ──────────────────────────────────────────────────
  const discoveryCount = persona === 'CURATOR' ? 2 : 3;
  const discoveries = DISCOVERY_POOL.slice(0, discoveryCount);

  // ── Volume ───────────────────────────────────────────────────────
  const totalProducts = Math.round(totalOrders * 1.6);

  return {
    version: 1,
    personality: persona,
    personalityReason: personalityReason(persona, uniqueCountriesCount),
    totalOrders,
    totalProducts,
    uniqueCategoriesCount,
    uniqueCountriesCount,
    homeCountry: home,
    topOriginCountries,
    carePackagesCount,
    carePackageDestinations,
    topCategories,
    cultural: {
      eidWeekOrders,
      independenceDayWeekOrders,
      christmasWeekOrders,
      busiestMonth,
      quietestMonth,
      monthlyOrderCounts,
    },
    smallBusinessesSupported,
    topSellers,
    loyalty: {
      coinsEarned,
      coinsRedeemedNgn,
      finalTier,
      percentileRank,
    },
    discoveries,
  };
}
