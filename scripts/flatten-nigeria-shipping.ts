/// One-off (Tracker #53, 2026-05-19) — flatten Nigeria shipping into
/// a single zone with two flat weight-bracket rates:
///   0-5kg  → ₦1,500
///   5kg+   → ₦3,000
///
/// We DON'T delete the old NG zones (Lagos, Abuja, Rest of Nigeria)
/// or their rates — historical orders carry a FK to those rate IDs
/// (Order.shippingRateId, no onDelete cascade), so a delete would
/// fail mid-transaction. Instead we archive them:
///   - Rename with "[archived 2026-05-19]" prefix.
///   - Switch countries to ['ZZ'] (ISO-reserved user-assignable code
///     that doesn't map to any real country) so the zone matcher
///     never picks them for a real destination.
///   - Drop their cities to ensure the city-match path doesn't catch.
///
/// West Africa / East & Southern Africa / International zones are
/// left intact per Magnus' "Option A" call.
///
/// Idempotent: re-running detects the new "Nigeria (flat rate)" zone
/// and skips. Re-archiving already-archived zones is a no-op.
///
/// Run from local:
///   cd afrizonemart-api
///   DATABASE_URL="<DATABASE_PUBLIC_URL>" npx tsx scripts/flatten-nigeria-shipping.ts
import { PrismaClient } from '@prisma/client';

const ARCHIVE_PREFIX = '[archived 2026-05-19] ';
const NEW_ZONE_NAME = 'Nigeria (flat rate)';
/// Names of the zones we want to retire. Match against `name`
/// rather than id so the script reads as plain English.
const OLD_NG_ZONE_NAMES = ['Lagos', 'Abuja', 'Rest of Nigeria'];

const prisma = new PrismaClient();

async function main() {
  console.log('--- Pre-flight ---');
  const allZones = await prisma.shippingZone.findMany({
    include: { rates: true },
    orderBy: { name: 'asc' },
  });
  for (const z of allZones) {
    console.log(
      `  ${z.name.padEnd(40)} | countries=${JSON.stringify(z.countries)} | cities=${JSON.stringify(z.cities)} | ${z.rates.length} rate(s)`,
    );
  }

  /// 1. Archive the legacy NG zones (only the ones still active).
  const toArchive = allZones.filter(
    (z) =>
      OLD_NG_ZONE_NAMES.includes(z.name) && !z.name.startsWith(ARCHIVE_PREFIX),
  );
  if (toArchive.length === 0) {
    console.log('No legacy NG zones to archive (already archived or absent).');
  }
  for (const z of toArchive) {
    console.log(`Archiving zone "${z.name}" (id=${z.id})…`);
    await prisma.shippingZone.update({
      where: { id: z.id },
      data: {
        name: `${ARCHIVE_PREFIX}${z.name}`,
        countries: ['ZZ'],
        cities: [],
        isDefault: false,
      },
    });
  }

  /// 2. Create the new flat-rate Nigeria zone if it doesn't exist.
  const existing = allZones.find((z) => z.name === NEW_ZONE_NAME);
  if (existing) {
    console.log(
      `"${NEW_ZONE_NAME}" already exists (id=${existing.id}) — skipping zone create.`,
    );
  } else {
    const zone = await prisma.shippingZone.create({
      data: {
        name: NEW_ZONE_NAME,
        countries: ['NG'],
        cities: [],
        isDefault: false,
        sortOrder: 10,
      },
    });
    console.log(`Created zone "${zone.name}" (id=${zone.id}).`);
    /// 3. Seed the 2 flat rates.
    const rates = await prisma.shippingRate.createMany({
      data: [
        {
          zoneId: zone.id,
          name: 'Standard 0–5kg',
          priceAmount: 1500,
          minWeightKg: 0,
          maxWeightKg: 5,
          etaDaysMin: 2,
          etaDaysMax: 5,
          isDefault: true,
          sortOrder: 0,
        },
        {
          zoneId: zone.id,
          name: 'Standard 5kg+',
          priceAmount: 3000,
          minWeightKg: 5,
          maxWeightKg: null,
          etaDaysMin: 3,
          etaDaysMax: 7,
          isDefault: false,
          sortOrder: 1,
        },
      ],
    });
    console.log(`Created ${rates.count} rates on "${zone.name}".`);
  }

  console.log('--- Post ---');
  const after = await prisma.shippingZone.findMany({
    include: { rates: true },
    orderBy: { name: 'asc' },
  });
  for (const z of after) {
    if (z.name.startsWith(ARCHIVE_PREFIX) || z.countries.includes('NG')) {
      console.log(
        `  ${z.name.padEnd(40)} | countries=${JSON.stringify(z.countries)} | ${z.rates.length} rate(s)`,
      );
      for (const r of z.rates) {
        const bracket =
          r.minWeightKg === null && r.maxWeightKg === null
            ? 'any'
            : `${r.minWeightKg ?? '-'}..${r.maxWeightKg ?? '-'}kg`;
      console.log(`    - ${r.name.padEnd(30)} ₦${r.priceAmount.toLocaleString().padStart(8)} | ${bracket}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
