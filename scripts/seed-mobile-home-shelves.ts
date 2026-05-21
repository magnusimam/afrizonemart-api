/**
 * One-shot seed — register the 10 admin-controlled shelves used by
 * the mobile Home screen (Phase 3 shelf overhaul).
 *
 * Most shelves use **category auto-fill** (added in this same PR)
 * so they automatically pick up new products as the catalog grows.
 * `homepage_featured` and `staff_picks` stay curated (no auto-fill)
 * so admin can hand-pick whatever should sit at the top of the home.
 *
 * Idempotent — upserts by key. Re-running won't duplicate rows but
 * WILL overwrite title/rows/cols/enabled/categoryAutoFill back to
 * the defaults below. **If admin has tweaked any shelf manually,
 * those changes will be lost on re-run** — that's the intentional
 * "seed-from-code" behaviour for the home shelf set.
 *
 * Usage:
 *   railway run --service api npx tsx scripts/seed-mobile-home-shelves.ts
 */
import { PrismaClient } from '@prisma/client';

interface ShelfDef {
  key: string;
  title: string;
  subtitle?: string;
  rows: number;
  cols: number;
  /// Empty array = curated (admin hand-picks via ProductPlacement).
  /// Non-empty = auto-fill from products in these category slugs (and
  /// their subcategories).
  categoryAutoFill: string[];
}

/// 10 shelves for the mobile Home. The mobile DEFAULT_HOME_LAYOUT
/// references these keys in order. Categories chosen from the live
/// catalog's top-10 by product count (2026-05-21 snapshot):
///   groceries(278) drinks(241) books(178) home-essentials(62)
///   baby(60) stationery(60) snacks(59) office-supplies(55)
///   personal-care(47) eleganza(45).
const SHELVES: ShelfDef[] = [
  // Curated — admin picks. Top of home, biggest weight.
  {
    key: 'homepage_featured',
    title: "Today's Deals Just For You",
    subtitle: 'Hand-picked by our team',
    rows: 1,
    cols: 8,
    categoryAutoFill: [],
  },
  // Largest category — staples that drive recurring orders.
  {
    key: 'shelf_groceries',
    title: 'Groceries, Beverages & Drinks',
    subtitle: 'Stock up on the everyday essentials',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['groceries', 'drinks'],
  },
  // Second curated row — limited time / FOMO drivers.
  {
    key: 'staff_picks',
    title: "Don't Wait!",
    subtitle: 'Limited time picks',
    rows: 1,
    cols: 8,
    categoryAutoFill: [],
  },
  // Books — 178 SKUs, third-largest category.
  {
    key: 'shelf_books',
    title: 'Come For The Book, Stay For The Story',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['books'],
  },
  // Home — interiors + essentials.
  {
    key: 'shelf_home',
    title: 'Make It Home',
    subtitle: 'Everything for the everyday',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['home-essentials'],
  },
  // Baby — high-emotion, high-repeat category.
  {
    key: 'shelf_baby',
    title: 'For The Little Ones',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['baby'],
  },
  // Snacks — impulse buys.
  {
    key: 'shelf_snacks',
    title: 'Snack Attack',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['snacks'],
  },
  // Personal care.
  {
    key: 'shelf_personal_care',
    title: 'Personal Care',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['personal-care'],
  },
  // Office + stationery — both have ~55-60 SKUs, group together.
  {
    key: 'shelf_office',
    title: 'Office & Stationery',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['office-supplies', 'stationery'],
  },
  // Eleganza — likely a featured brand. Keep for now.
  {
    key: 'shelf_eleganza',
    title: 'Eleganza Collection',
    rows: 1,
    cols: 12,
    categoryAutoFill: ['eleganza'],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    let created = 0;
    let updated = 0;
    for (const def of SHELVES) {
      const existing = await prisma.shelf.findUnique({
        where: { key: def.key },
        select: { key: true },
      });
      await prisma.shelf.upsert({
        where: { key: def.key },
        create: {
          key: def.key,
          title: def.title,
          subtitle: def.subtitle ?? null,
          rows: def.rows,
          cols: def.cols,
          enabled: true,
          categoryAutoFill: def.categoryAutoFill,
        },
        update: {
          title: def.title,
          subtitle: def.subtitle ?? null,
          rows: def.rows,
          cols: def.cols,
          enabled: true,
          categoryAutoFill: def.categoryAutoFill,
        },
      });
      if (existing) {
        console.log(`~ Updated ${def.key} (${def.categoryAutoFill.length > 0 ? 'auto-fill: ' + def.categoryAutoFill.join(',') : 'curated'})`);
        updated++;
      } else {
        console.log(`+ Created ${def.key}`);
        created++;
      }
    }
    console.log('');
    console.log(`Created: ${created}, updated: ${updated}, total: ${SHELVES.length}`);
    console.log('');
    console.log('Verify a shelf:');
    console.log(
      '  curl https://api.afrizonemart.com/api/shelves/shelf_groceries',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
