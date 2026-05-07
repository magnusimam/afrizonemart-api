/**
 * Phase 11 — one-shot seeder for default Nigerian shipping zones + rates.
 *
 * Idempotent: skips zones that already exist by name. Run once after
 * the Phase 1 shipping migration to give the system a working set of
 * rates so checkout actually returns quotes out of the box. Editors
 * tweak values in /admin/shipping afterward.
 *
 * Usage:
 *   railway run npm run seed-shipping-rates
 *   railway run npm run seed-shipping-rates -- --dry-run
 */
import { PrismaClient } from '@prisma/client';

interface RateSeed {
  name: string;
  priceAmount: number;
  freeAboveAmount?: number | null;
  minWeightKg?: number | null;
  maxWeightKg?: number | null;
  etaDaysMin: number;
  etaDaysMax: number;
  isDefault?: boolean;
  sortOrder?: number;
}

interface ZoneSeed {
  name: string;
  countries: string[];
  cities: string[];
  isDefault: boolean;
  sortOrder: number;
  rates: RateSeed[];
}

/// Sensible defaults — Naira, weight in kg, ETA in days. Editor can
/// tune in /admin/shipping; this is just so the system works on day one.
const SEED: ZoneSeed[] = [
  {
    name: 'Lagos',
    countries: ['NG'],
    cities: ['Lagos'],
    isDefault: false,
    sortOrder: 10,
    rates: [
      { name: 'Lagos Standard 0–1kg', priceAmount: 1500, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 1, etaDaysMax: 2, isDefault: true, sortOrder: 10 },
      { name: 'Lagos Standard 1–5kg', priceAmount: 2500, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 1, etaDaysMax: 2, sortOrder: 20 },
      { name: 'Lagos Standard 5–20kg', priceAmount: 5000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 2, etaDaysMax: 3, sortOrder: 30 },
      { name: 'Lagos Standard 20kg+', priceAmount: 12000, minWeightKg: 20, maxWeightKg: null, etaDaysMin: 2, etaDaysMax: 4, sortOrder: 40 },
      { name: 'Lagos Express 0–5kg', priceAmount: 4500, minWeightKg: 0, maxWeightKg: 5, etaDaysMin: 0, etaDaysMax: 1, freeAboveAmount: 50000, sortOrder: 100 },
    ],
  },
  {
    name: 'Abuja',
    countries: ['NG'],
    cities: ['Abuja', 'FCT'],
    isDefault: false,
    sortOrder: 20,
    rates: [
      { name: 'Abuja Standard 0–1kg', priceAmount: 2000, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 2, etaDaysMax: 3, isDefault: true, sortOrder: 10 },
      { name: 'Abuja Standard 1–5kg', priceAmount: 3500, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 2, etaDaysMax: 3, sortOrder: 20 },
      { name: 'Abuja Standard 5–20kg', priceAmount: 7000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 3, etaDaysMax: 4, sortOrder: 30 },
      { name: 'Abuja Standard 20kg+', priceAmount: 15000, minWeightKg: 20, maxWeightKg: null, etaDaysMin: 3, etaDaysMax: 5, sortOrder: 40 },
    ],
  },
  {
    name: 'Rest of Nigeria',
    countries: ['NG'],
    cities: [],
    isDefault: false,
    sortOrder: 30,
    rates: [
      { name: 'NG Standard 0–1kg', priceAmount: 2500, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 3, etaDaysMax: 5, isDefault: true, sortOrder: 10 },
      { name: 'NG Standard 1–5kg', priceAmount: 4000, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 3, etaDaysMax: 5, sortOrder: 20 },
      { name: 'NG Standard 5–20kg', priceAmount: 8000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 4, etaDaysMax: 7, sortOrder: 30 },
      { name: 'NG Standard 20kg+', priceAmount: 18000, minWeightKg: 20, maxWeightKg: null, etaDaysMin: 5, etaDaysMax: 10, sortOrder: 40 },
    ],
  },
  {
    name: 'West Africa',
    countries: ['GH', 'SN', 'CI', 'BJ', 'TG', 'BF', 'ML', 'GN', 'NE', 'LR', 'SL'],
    cities: [],
    isDefault: false,
    sortOrder: 40,
    rates: [
      { name: 'WA Standard 0–1kg', priceAmount: 8000, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 5, etaDaysMax: 9, isDefault: true, sortOrder: 10 },
      { name: 'WA Standard 1–5kg', priceAmount: 15000, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 5, etaDaysMax: 9, sortOrder: 20 },
      { name: 'WA Standard 5–20kg', priceAmount: 30000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 7, etaDaysMax: 14, sortOrder: 30 },
    ],
  },
  {
    name: 'East & Southern Africa',
    countries: ['KE', 'TZ', 'UG', 'RW', 'ET', 'ZA', 'ZW', 'BW', 'NA', 'MZ', 'AO', 'ZM', 'MW'],
    cities: [],
    isDefault: false,
    sortOrder: 50,
    rates: [
      { name: 'ESA Standard 0–1kg', priceAmount: 12000, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 7, etaDaysMax: 14, isDefault: true, sortOrder: 10 },
      { name: 'ESA Standard 1–5kg', priceAmount: 22000, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 7, etaDaysMax: 14, sortOrder: 20 },
      { name: 'ESA Standard 5–20kg', priceAmount: 45000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 10, etaDaysMax: 21, sortOrder: 30 },
    ],
  },
  {
    name: 'Rest of world',
    countries: [],
    cities: [],
    isDefault: true,
    sortOrder: 999,
    rates: [
      { name: 'International 0–1kg', priceAmount: 18000, minWeightKg: 0, maxWeightKg: 1, etaDaysMin: 10, etaDaysMax: 21, isDefault: true, sortOrder: 10 },
      { name: 'International 1–5kg', priceAmount: 35000, minWeightKg: 1, maxWeightKg: 5, etaDaysMin: 10, etaDaysMax: 21, sortOrder: 20 },
      { name: 'International 5–20kg', priceAmount: 75000, minWeightKg: 5, maxWeightKg: 20, etaDaysMin: 14, etaDaysMax: 28, sortOrder: 30 },
    ],
  },
];

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');

  try {
    const existing = await prisma.shippingZone.findMany({
      select: { name: true },
    });
    const existingNames = new Set(existing.map((z) => z.name));

    type ZoneAction = 'created' | 'skipped';
    const summary: Array<{ name: string; action: ZoneAction; rates: number }> = [];

    for (const z of SEED) {
      if (existingNames.has(z.name)) {
        summary.push({ name: z.name, action: 'skipped', rates: 0 });
        continue;
      }
      if (dryRun) {
        summary.push({ name: z.name, action: 'created', rates: z.rates.length });
        continue;
      }
      await prisma.shippingZone.create({
        data: {
          name: z.name,
          countries: z.countries,
          cities: z.cities,
          isDefault: z.isDefault,
          sortOrder: z.sortOrder,
          rates: {
            create: z.rates.map((r) => ({
              name: r.name,
              priceAmount: r.priceAmount,
              freeAboveAmount: r.freeAboveAmount ?? null,
              minWeightKg: r.minWeightKg ?? null,
              maxWeightKg: r.maxWeightKg ?? null,
              etaDaysMin: r.etaDaysMin,
              etaDaysMax: r.etaDaysMax,
              isDefault: r.isDefault ?? false,
              sortOrder: r.sortOrder ?? 0,
            })),
          },
        },
      });
      summary.push({ name: z.name, action: 'created', rates: z.rates.length });
    }

    console.log('Result:');
    for (const s of summary) {
      const icon = s.action === 'created' ? '✓' : '·';
      console.log(`  ${icon} ${s.name.padEnd(28)} ${s.action.padEnd(10)} (${s.rates} rates)`);
    }
    if (dryRun) console.log('\n(dry-run — no rows written.)');
    else console.log('\nDone. Tweak in /admin/shipping.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('seed-shipping-rates failed:', err);
  process.exit(1);
});
