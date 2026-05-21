/**
 * One-shot seed — push the 10 default hero slides currently bundled
 * at `afrizonemart-v2/public/images/hero/*.{jpg,webp}` into the
 * `Setting` table as the `content.home.hero.slides` override.
 *
 * Why this exists:
 *   The web's `<HeroSlider>` component falls back to hardcoded
 *   `DEFAULT_SLIDES` (local `/images/hero/slide-*.jpg` paths) when
 *   no admin override is set. Mobile reads the same content key but
 *   doesn't ship those bundled files — so the mobile hero stayed
 *   empty even though customers see the slider on web.
 *
 *   Indexing the defaults into the Setting table:
 *   1. Makes them visible + editable in `/admin/content` → Hero
 *      (the slot is already registered in
 *      `src/modules/content/registry.ts:53`).
 *   2. Promotes them to absolute URLs so mobile (and any other
 *      surface) can render them.
 *   3. Both web + mobile read from the same source going forward.
 *
 * Idempotent: re-upserts the same value on every run. Safe to call
 * twice.
 *
 * Usage:
 *   railway run --service api npx tsx scripts/seed-default-hero-slides.ts
 *
 * Override the storefront base URL (defaults to production) with:
 *   STOREFRONT_BASE_URL=https://staging.afrizonemart.com npx tsx ...
 */
import { Prisma, PrismaClient } from '@prisma/client';

const STOREFRONT_BASE = (
  process.env.STOREFRONT_BASE_URL ?? 'https://afrizonemart.com'
).replace(/\/+$/, '');

interface HeroSlide {
  url: string;
  alt: string;
}

/// Mirrors `DEFAULT_SLIDES` in
/// `afrizonemart-v2/src/components/layout/HeroSlider.tsx`. Keep in
/// sync if either list is reordered.
const DEFAULT_SLIDES: HeroSlide[] = [
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-world-map.jpg`,
    alt: 'From Africa to the rest of the world',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-just-for-you.jpg`,
    alt: 'Just For You — featured African fashion',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-member-benefits.jpg`,
    alt: 'Special Member-Only Benefits — Earn points every time you shop',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-gift-cards.jpg`,
    alt: 'Gift Cards Available — for corporate customers, anniversaries, birthdays, weddings',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-for-her.jpg`,
    alt: 'For Her — Get everything for females at amazing discounts',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-for-him.jpg`,
    alt: 'For Him — Maintain class without breaking the bank',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-everything-africa.jpg`,
    alt: 'Buy everything made in Africa',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-groceries.jpg`,
    alt: 'Groceries & Beverages',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-afcfta.webp`,
    alt: 'We support the African Continental Free Trade Agreement — 100% Made in Africa',
  },
  {
    url: `${STOREFRONT_BASE}/images/hero/slide-shop-now.jpg`,
    alt: 'AfriZoneMart — Shop Now',
  },
];

const SLOT_KEY = 'content.home.hero.slides';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.setting.findUnique({
      where: { key: SLOT_KEY },
      select: { key: true },
    });

    /// Cast through unknown to satisfy Prisma's `InputJsonValue` —
    /// our typed `HeroSlide[]` is a valid JSON value at runtime but
    /// the structural type is too narrow for Prisma's index-signature
    /// requirement.
    const value = DEFAULT_SLIDES as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({
      where: { key: SLOT_KEY },
      create: { key: SLOT_KEY, value },
      update: { value },
    });

    if (existing) {
      console.log(`✓ Updated ${SLOT_KEY} (${DEFAULT_SLIDES.length} slides)`);
    } else {
      console.log(`✓ Created ${SLOT_KEY} (${DEFAULT_SLIDES.length} slides)`);
    }
    console.log(`  Storefront base: ${STOREFRONT_BASE}`);
    console.log(`  First slide:     ${DEFAULT_SLIDES[0]?.url}`);
    console.log('');
    console.log('Verify:');
    console.log(`  curl ${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.afrizonemart.com'}/api/content`);
    console.log('Admin can edit at:');
    console.log(`  ${STOREFRONT_BASE}/admin/content → Homepage → Hero`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
