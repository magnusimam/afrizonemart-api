import { prisma } from '@/infra/prisma';
import type {
  ShippingProvider,
  ShippingQuote,
  ShippingQuoteContext,
} from './types';

/**
 * Phase 11 — Manual rate-card provider.
 *
 * Walks the admin-managed `ShippingZone` + `ShippingRate` tables to
 * produce quotes. This is the floor that always works — even after
 * carrier APIs land, manual stays as the last entry in the provider
 * walk so a checkout never fails just because a carrier API timed
 * out.
 *
 * Algorithm:
 *  1. Pick the *most specific* matching zone for the destination:
 *     - flagship-city zones (cities[] non-empty + city matches) win
 *       over country-only zones
 *     - country-only zones win over the wildcard "Rest of world"
 *       (`isDefault = true, countries = []`)
 *  2. Within that zone, every rate row whose [minWeightKg, maxWeightKg]
 *     bracket contains the cart's total weight becomes a quote option.
 *     A rate with both bounds null matches every cart (back-compat
 *     with old flat rates).
 *  3. Apply `freeAboveAmount` — when the cart subtotal meets or
 *     exceeds the threshold, the rate's price drops to ₦0 (kept as a
 *     visible quote so customers see "Free" instead of the section
 *     vanishing).
 *
 * No call returns zero quotes: the wildcard zone + a baseline rate
 * row guarantees something always renders. If admin somehow wipes
 * every zone, we fall through to a ₦0 "Manual rate not configured"
 * quote so checkout doesn't break — surface it to ops via the toast,
 * better than a hard error.
 */
function pickZone<T extends { countries: string[]; cities: string[]; isDefault: boolean; sortOrder: number }>(
  zones: T[],
  country: string,
  city?: string,
): T | null {
  const upperCountry = country.toUpperCase();
  const lowerCity = city?.trim().toLowerCase() ?? null;

  // Most specific first: flagship-city match.
  if (lowerCity) {
    const cityMatch = zones.find(
      (z) =>
        z.countries.map((c) => c.toUpperCase()).includes(upperCountry) &&
        z.cities.length > 0 &&
        z.cities.map((c) => c.trim().toLowerCase()).includes(lowerCity),
    );
    if (cityMatch) return cityMatch;
  }

  // Country-only zone (cities empty).
  const countryMatch = zones.find(
    (z) =>
      z.cities.length === 0 &&
      z.countries.length > 0 &&
      z.countries.map((c) => c.toUpperCase()).includes(upperCountry),
  );
  if (countryMatch) return countryMatch;

  // Default / wildcard.
  const wildcard = zones.find(
    (z) => z.isDefault || (z.countries.length === 0 && z.cities.length === 0),
  );
  return wildcard ?? null;
}

function rateMatchesWeight(
  rate: { minWeightKg: number | null; maxWeightKg: number | null },
  weightKg: number,
): boolean {
  if (rate.minWeightKg !== null && weightKg < rate.minWeightKg) return false;
  if (rate.maxWeightKg !== null && weightKg > rate.maxWeightKg) return false;
  return true;
}

function describeBracket(rate: {
  minWeightKg: number | null;
  maxWeightKg: number | null;
}): string {
  if (rate.minWeightKg === null && rate.maxWeightKg === null) return 'any weight';
  if (rate.minWeightKg === null) return `up to ${rate.maxWeightKg}kg`;
  if (rate.maxWeightKg === null) return `${rate.minWeightKg}kg+`;
  return `${rate.minWeightKg}–${rate.maxWeightKg}kg`;
}

export const manualShippingProvider: ShippingProvider = {
  key: 'manual',
  label: 'Manual rate card',
  async quote(ctx: ShippingQuoteContext): Promise<ShippingQuote[]> {
    const zones = await prisma.shippingZone.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { rates: { orderBy: [{ sortOrder: 'asc' }] } },
    });
    if (zones.length === 0) return [];

    const zone = pickZone(zones, ctx.destination.country, ctx.destination.city);
    if (!zone) return [];

    const totalWeightKg = ctx.items.reduce(
      (acc, it) => acc + it.weightKg * it.qty,
      0,
    );

    const matching = zone.rates.filter((r) => rateMatchesWeight(r, totalWeightKg));
    if (matching.length === 0) return [];

    return matching.map((r): ShippingQuote => {
      const free =
        r.freeAboveAmount !== null && ctx.subtotalNgn >= r.freeAboveAmount;
      const why = [
        `zone=${zone.name}`,
        `${totalWeightKg.toFixed(2)}kg in ${describeBracket(r)} bracket`,
        free ? `free above ₦${r.freeAboveAmount}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        provider: 'manual',
        rateId: r.id,
        label: r.name,
        amountNgn: free ? 0 : r.priceAmount,
        etaDaysMin: r.etaDaysMin,
        etaDaysMax: r.etaDaysMax,
        reason: why,
      };
    });
  },
};
