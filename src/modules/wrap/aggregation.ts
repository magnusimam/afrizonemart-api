import { prisma } from '@/infra/prisma';
import type { WrappedPersonality, WrappedStatsV1 } from './types';

/**
 * Aggregate a single user's WrappedStats for one year.
 *
 * Idempotent — safe to call repeatedly. The daily cron upserts
 * into WrappedSnapshot.
 *
 * Returns `null` when the customer doesn't meet the minimum
 * activity threshold (< MIN_ORDERS qualifying orders). Caller
 * skips the upsert in that case — we don't want hollow wraps in
 * the database.
 *
 * Qualifying orders: PAID, FULFILLING, SHIPPED, OUT_FOR_DELIVERY,
 * DELIVERED, REFUNDED. PENDING_PAYMENT and CANCELLED are
 * excluded — they don't represent customer interest the seller
 * actually fulfilled.
 *
 * **No money totals**. Intentional (WRAP_TRACKER.md §1). The
 * loyalty card shows coin earnings; everywhere else we count
 * orders / items / categories / countries, not amounts.
 */

export const MIN_ORDERS = 3;

export const QUALIFYING_STATUSES = [
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REFUNDED',
] as const;

/**
 * Count a user's qualifying orders in a year — the eligibility
 * number behind the "you're at N orders, unlock at 3" teaser. Cheap
 * COUNT, no item joins (unlike computeUserWrap).
 */
export async function countQualifyingOrders(
  userId: string,
  year: number,
): Promise<number> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  return prisma.order.count({
    where: {
      userId,
      status: { in: [...QUALIFYING_STATUSES] },
      createdAt: { gte: yearStart, lt: yearEnd },
    },
  });
}

/**
 * Compact country-name map for the African nations we trade with.
 * Avoids dragging in the storefront's countries.ts; the wrap
 * doesn't need flags or slugs, just display names.
 */
const COUNTRY_NAME: Record<string, string> = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  ET: 'Ethiopia',
  EG: 'Egypt',
  MA: 'Morocco',
  TZ: 'Tanzania',
  UG: 'Uganda',
  CI: "Côte d'Ivoire",
  CM: 'Cameroon',
  SN: 'Senegal',
  RW: 'Rwanda',
  DZ: 'Algeria',
  TN: 'Tunisia',
  AO: 'Angola',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  BW: 'Botswana',
  NA: 'Namibia',
  ML: 'Mali',
  BJ: 'Benin',
  BF: 'Burkina Faso',
  TG: 'Togo',
  NE: 'Niger',
  TD: 'Chad',
  GN: 'Guinea',
  GM: 'Gambia',
  LR: 'Liberia',
  SL: 'Sierra Leone',
  MZ: 'Mozambique',
  MG: 'Madagascar',
  MU: 'Mauritius',
  SC: 'Seychelles',
  CV: 'Cape Verde',
  ST: 'São Tomé and Príncipe',
  KM: 'Comoros',
  DJ: 'Djibouti',
  ER: 'Eritrea',
  SO: 'Somalia',
  SS: 'South Sudan',
  SD: 'Sudan',
  LY: 'Libya',
  GA: 'Gabon',
  CG: 'Congo',
  CD: 'DR Congo',
  CF: 'Central African Republic',
  GQ: 'Equatorial Guinea',
  LS: 'Lesotho',
  SZ: 'Eswatini',
  MW: 'Malawi',
  BI: 'Burundi',
  GW: 'Guinea-Bissau',
  MR: 'Mauritania',
  EH: 'Western Sahara',
};

function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return COUNTRY_NAME[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Eid week / Independence Day week / Christmas week.
 *
 * Eid + Independence dates vary by year + country. For v1 we hard-
 * code the dominant Nigerian observances (the bulk of our orders
 * come from / ship to Nigeria). Generalising to per-country
 * cultural calendars is a v2 unlock.
 *
 * Eid al-Fitr 2026 falls ~Mar 21; Eid al-Adha 2026 ~May 28.
 * Nigerian Independence Day = Oct 1.
 * Christmas = Dec 25.
 *
 * "Week" = ±3 days around the date.
 */
function culturalWeekRange(
  year: number,
): { eid: Date[]; independence: Date[]; christmas: Date[] } {
  const make = (month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
  return {
    eid: [make(3, 21), make(5, 28)],   // approximate; refine yearly
    independence: [make(10, 1)],
    christmas: [make(12, 25)],
  };
}

function isWithin(date: Date, anchors: Date[], windowDays = 3): boolean {
  const ms = windowDays * 24 * 60 * 60 * 1000;
  return anchors.some((a) => Math.abs(date.getTime() - a.getTime()) <= ms);
}

function classifyPersonality(input: {
  carePackagesShare: number;
  topOriginShare: number;
  uniqueOriginsCount: number;
}): { personality: WrappedPersonality; reason: string } {
  if (input.carePackagesShare >= 0.4) {
    return {
      personality: 'CONNECTOR',
      reason:
        'You sent more care packages than 87% of buyers this year.',
    };
  }
  if (input.topOriginShare >= 0.7) {
    return {
      personality: 'PATRIOT',
      reason:
        "You stuck mostly to one country's makers all year.",
    };
  }
  if (input.uniqueOriginsCount >= 4) {
    return {
      personality: 'EXPLORER',
      reason: `You shopped from ${input.uniqueOriginsCount} different African countries this year.`,
    };
  }
  return {
    personality: 'CURATOR',
    reason: 'You shopped with intent — fewer items, carefully chosen.',
  };
}

export async function computeUserWrap(
  userId: string,
  year: number,
): Promise<WrappedStatsV1 | null> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const orders = await prisma.order.findMany({
    where: {
      userId,
      status: { in: [...QUALIFYING_STATUSES] },
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    select: {
      id: true,
      createdAt: true,
      shipCountry: true,
      items: {
        select: {
          productId: true,
          product: {
            select: {
              slug: true,
              name: true,
              images: true,
              brand: true,
              origin: true,
              rating: true,
              reviewCount: true,
              category: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (orders.length < MIN_ORDERS) return null;

  // ── Volume ───────────────────────────────────────────────────────
  const totalOrders = orders.length;
  const productSlugSet = new Set<string>();
  const categorySlugCounts = new Map<string, { name: string; count: number }>();
  const originCountryCounts = new Map<string, number>();
  const sellerBrandCounts = new Map<
    string,
    { country: string | null; count: number }
  >();

  for (const o of orders) {
    const seenInOrder = new Set<string>(); // dedupe same product in same order
    for (const it of o.items) {
      const p = it.product;
      if (!p) continue;
      if (!seenInOrder.has(p.slug)) {
        productSlugSet.add(p.slug);
        seenInOrder.add(p.slug);
      }
      if (p.category) {
        const cur = categorySlugCounts.get(p.category.slug);
        if (cur) cur.count++;
        else
          categorySlugCounts.set(p.category.slug, {
            name: p.category.name,
            count: 1,
          });
      }
      if (p.origin) {
        const code = p.origin.toUpperCase();
        originCountryCounts.set(code, (originCountryCounts.get(code) ?? 0) + 1);
      }
      if (p.brand && p.brand.trim().length > 0) {
        const cur = sellerBrandCounts.get(p.brand);
        if (cur) cur.count++;
        else
          sellerBrandCounts.set(p.brand, {
            country: p.origin ? p.origin.toUpperCase() : null,
            count: 1,
          });
      }
    }
  }

  // ── Geography ────────────────────────────────────────────────────
  // Resolve homeCountry: default address → most-frequent ship-to →
  // null. Default-address lookup is cheap; the user table has
  // addresses[] via relation.
  const defaultAddr = await prisma.userAddress.findFirst({
    where: { userId, isDefault: true },
    select: { country: true },
  });
  let homeCountry: string | null = defaultAddr?.country?.toUpperCase() ?? null;
  if (!homeCountry) {
    const shipCounts = new Map<string, number>();
    for (const o of orders) {
      const code = o.shipCountry?.toUpperCase();
      if (!code) continue;
      shipCounts.set(code, (shipCounts.get(code) ?? 0) + 1);
    }
    let topShipCount = 0;
    for (const [code, count] of shipCounts) {
      if (count > topShipCount) {
        topShipCount = count;
        homeCountry = code;
      }
    }
  }

  const topOriginCountries = [...originCountryCounts.entries()]
    .map(([code, count]) => ({
      code,
      name: countryName(code),
      orderCount: count,
      sharePct: Math.round((count / totalOrders) * 100),
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5);

  const uniqueCountriesCount = originCountryCounts.size;

  // ── Care packages (ship-to differs from home country) ────────────
  let carePackagesCount = 0;
  const carePackageDestinationSet = new Set<string>();
  for (const o of orders) {
    const ship = o.shipCountry?.toUpperCase();
    if (!ship) continue;
    if (homeCountry && ship !== homeCountry) {
      carePackagesCount++;
      carePackageDestinationSet.add(ship);
    }
  }

  // ── Categories ───────────────────────────────────────────────────
  const topCategories = [...categorySlugCounts.entries()]
    .map(([slug, { name, count }]) => ({
      slug,
      name,
      orderCount: count,
      sharePct: Math.round((count / totalOrders) * 100),
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5);

  // ── Cultural moments ─────────────────────────────────────────────
  const culturalDates = culturalWeekRange(year);
  let eidWeekOrders = 0;
  let independenceDayWeekOrders = 0;
  let christmasWeekOrders = 0;
  const monthlyOrderCounts = new Array(12).fill(0);

  for (const o of orders) {
    const d = o.createdAt;
    monthlyOrderCounts[d.getUTCMonth()]++;
    if (isWithin(d, culturalDates.eid)) eidWeekOrders++;
    if (isWithin(d, culturalDates.independence)) independenceDayWeekOrders++;
    if (isWithin(d, culturalDates.christmas)) christmasWeekOrders++;
  }

  let busiestMonth = { month: 0, orders: 0 };
  let quietestMonth = { month: 0, orders: Infinity };
  for (let m = 0; m < 12; m++) {
    const c = monthlyOrderCounts[m] ?? 0;
    if (c > busiestMonth.orders) busiestMonth = { month: m + 1, orders: c };
    if (c < quietestMonth.orders) quietestMonth = { month: m + 1, orders: c };
  }
  if (quietestMonth.orders === Infinity) quietestMonth = { month: 1, orders: 0 };

  // ── Impact (top sellers) ─────────────────────────────────────────
  const topSellers = [...sellerBrandCounts.entries()]
    .map(([brand, { country, count }]) => ({
      brand,
      country: country ? countryName(country) : null,
      orderCount: count,
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 3);

  // ── Loyalty ──────────────────────────────────────────────────────
  const loyaltyAccount = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: { coinBalance: true, currentTier: true },
  });

  // Coins earned in the year (sum of positive EARN/BONUS-type
  // transactions). LoyaltyTransaction.delta is signed: + for
  // earn/bonus, - for redeem/expire/clawback.
  const coinTxs = await prisma.loyaltyTransaction.aggregate({
    where: {
      account: { userId },
      createdAt: { gte: yearStart, lt: yearEnd },
      delta: { gt: 0 },
    },
    _sum: { delta: true },
  });
  const coinsEarned = coinTxs._sum.delta ?? 0;

  // NGN value of redeemed coins this year (Order.coinDiscount).
  const redeemedNgn = await prisma.order.aggregate({
    where: {
      userId,
      coinsRedeemed: { gt: 0 },
      createdAt: { gte: yearStart, lt: yearEnd },
    },
    _sum: { coinDiscount: true },
  });
  const coinsRedeemedNgn = redeemedNgn._sum.coinDiscount ?? 0;

  // Percentile rank vs all users' coin earnings this year. Bounded
  // query — runs cheaply because LoyaltyTransaction is already
  // indexed by accountId.
  const allEarners = await prisma.$queryRawUnsafe<
    Array<{ user_id: string; earned: bigint }>
  >(
    `
    SELECT la."userId" AS user_id, COALESCE(SUM(lt.delta), 0)::bigint AS earned
    FROM "LoyaltyAccount" la
    LEFT JOIN "LoyaltyTransaction" lt
      ON lt."accountId" = la.id
      AND lt.delta > 0
      AND lt."createdAt" >= $1 AND lt."createdAt" < $2
    GROUP BY la."userId"
    `,
    yearStart,
    yearEnd,
  );
  const myEarned = coinsEarned;
  const usersWithLowerOrEqual = allEarners.filter(
    (r) => Number(r.earned) <= myEarned,
  ).length;
  const percentileRank =
    allEarners.length > 0
      ? Math.round((usersWithLowerOrEqual / allEarners.length) * 100)
      : 0;

  // ── Discoveries (products with rating>=4.5, reviewCount>=10) ────
  const discoveries: WrappedStatsV1['discoveries'] = [];
  const seenDiscoverySlug = new Set<string>();
  for (const o of orders) {
    for (const it of o.items) {
      const p = it.product;
      if (!p) continue;
      if (seenDiscoverySlug.has(p.slug)) continue;
      if ((p.rating ?? 0) < 4.5) continue;
      if ((p.reviewCount ?? 0) < 10) continue;
      discoveries.push({
        productSlug: p.slug,
        productName: p.name,
        productImage: p.images?.[0] ?? null,
        why: `Top-rated by other shoppers since you bought it.`,
      });
      seenDiscoverySlug.add(p.slug);
      if (discoveries.length >= 3) break;
    }
    if (discoveries.length >= 3) break;
  }

  // ── Personality ──────────────────────────────────────────────────
  const topOriginShare =
    topOriginCountries[0]
      ? topOriginCountries[0].orderCount / totalOrders
      : 0;
  const carePackagesShare = carePackagesCount / totalOrders;
  const { personality, reason } = classifyPersonality({
    carePackagesShare,
    topOriginShare,
    uniqueOriginsCount: uniqueCountriesCount,
  });

  return {
    version: 1,
    personality,
    personalityReason: reason,
    totalOrders,
    totalProducts: productSlugSet.size,
    uniqueCategoriesCount: categorySlugCounts.size,
    uniqueCountriesCount,
    homeCountry,
    topOriginCountries,
    carePackagesCount,
    carePackageDestinations: [...carePackageDestinationSet],
    topCategories,
    cultural: {
      eidWeekOrders,
      independenceDayWeekOrders,
      christmasWeekOrders,
      busiestMonth,
      quietestMonth,
      monthlyOrderCounts,
    },
    smallBusinessesSupported: sellerBrandCounts.size,
    topSellers,
    loyalty: {
      coinsEarned,
      coinsRedeemedNgn,
      finalTier: (loyaltyAccount?.currentTier ?? 'BLUE') as
        | 'BLUE'
        | 'SILVER'
        | 'GOLD'
        | 'PLATINUM',
      percentileRank,
    },
    discoveries,
  };
}
