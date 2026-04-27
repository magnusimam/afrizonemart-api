import { prisma } from '@/infra/prisma';

export interface PublicShippingRate {
  id: string;
  name: string;
  priceAmount: number;
  freeAboveAmount: number | null;
  isDefault: boolean;
}

export interface ShippingRatesResult {
  zoneId: string | null;
  zoneName: string | null;
  rates: PublicShippingRate[];
}

/**
 * Find the rates available for a given ship-to country.
 *
 * Resolution order:
 *   1. Zone whose `countries[]` contains the requested country.
 *   2. The catch-all default zone (`isDefault=true`, typically empty
 *      countries array).
 *   3. Empty rate list — admin hasn't configured shipping yet.
 */
export async function getRatesForCountry(country: string): Promise<ShippingRatesResult> {
  const iso = country.trim().toUpperCase();
  const zones = await prisma.shippingZone.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { rates: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
  });

  const matched = zones.find((z) => z.countries.includes(iso));
  const fallback = zones.find((z) => z.isDefault);
  const chosen = matched ?? fallback ?? null;

  if (!chosen) return { zoneId: null, zoneName: null, rates: [] };

  return {
    zoneId: chosen.id,
    zoneName: chosen.name,
    rates: chosen.rates.map((r) => ({
      id: r.id,
      name: r.name,
      priceAmount: r.priceAmount,
      freeAboveAmount: r.freeAboveAmount,
      isDefault: r.isDefault,
    })),
  };
}

/**
 * Compute the actual shipping cost for a given rate + cart subtotal.
 * Returns 0 if the rate is null (no rate selected → free shipping
 * fallback) or if the subtotal triggers `freeAboveAmount`.
 */
export function computeShippingCost(
  rate: { priceAmount: number; freeAboveAmount: number | null } | null,
  subtotal: number,
): number {
  if (!rate) return 0;
  if (rate.freeAboveAmount != null && subtotal >= rate.freeAboveAmount) return 0;
  return rate.priceAmount;
}
