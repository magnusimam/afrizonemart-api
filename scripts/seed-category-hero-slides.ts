/**
 * One-shot seed — set per-category hero slide lists so the mobile
 * Category landing screen has visible hero artwork on first launch.
 *
 * Mobile reads `content.category.<slug>.hero.slides` (set up by
 * mobile PR #15). Admin can edit each list via the new
 * `/admin/category-heroes` page (storefront PR landing alongside
 * this seed).
 *
 * The seed reuses two image sources to keep things simple + so
 * Magnus has live data to look at:
 *   1. The category's own cover image (if `Category.image` is set
 *      — populated by `seed-category-images.ts`).
 *   2. The global hero slides currently in /admin/content (any 2
 *      of the 10 default slides as a placeholder).
 *
 * Each seeded category gets 2 slides. Admin can swap them with
 * real artwork via the admin page.
 *
 * Idempotent — re-runs overwrite the Setting row for each touched
 * category. Untouched categories keep whatever admin set.
 *
 * Usage:
 *   railway run --service api npx tsx scripts/seed-category-hero-slides.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

/// Categories we seed mock heroes for. Subset of the top-level
/// categories with R2 covers — picked because they're the ones
/// the mobile chip row + shelves drive traffic to. Other
/// categories show no hero on the landing screen until admin
/// adds one.
const SEED_SLUGS = [
  'groceries',
  'beauty',
  'interior-decor',
  'for-her',
  'for-him',
  'art-collectibles',
  'drinks',
];

interface Slide {
  url: string;
  alt: string;
  link?: string;
}

const SLOT_KEY = (slug: string) => `content.category.${slug}.hero.slides`;
const GLOBAL_HERO_KEY = 'content.home.hero.slides';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    /// Load the global hero slides — we recycle two of them as
    /// placeholder secondary slides per category. This proves the
    /// system end-to-end with real CDN URLs; admin replaces them
    /// later with category-specific art.
    const globalSetting = await prisma.setting.findUnique({
      where: { key: GLOBAL_HERO_KEY },
      select: { value: true },
    });
    const globalSlides: Slide[] = Array.isArray(globalSetting?.value)
      ? (globalSetting.value as unknown as Slide[])
      : [];
    if (globalSlides.length < 2) {
      console.warn(
        `! global hero has ${globalSlides.length} slide(s); seed will skip placeholder fallback`,
      );
    }

    let touched = 0;
    let skipped = 0;
    for (const slug of SEED_SLUGS) {
      const cat = await prisma.category.findUnique({
        where: { slug },
        select: { id: true, name: true, image: true },
      });
      if (!cat) {
        console.log(`- ${slug}: no matching category, skipping`);
        skipped++;
        continue;
      }

      const slides: Slide[] = [];
      if (cat.image) {
        slides.push({
          url: cat.image,
          alt: `${cat.name} cover`,
          link: `/shop/${slug}`,
        });
      }
      /// Add up to 2 global slides as placeholders so the slider
      /// has rotation. Admin can prune.
      for (let i = 0; i < Math.min(2, globalSlides.length); i++) {
        slides.push(globalSlides[i]!);
      }

      if (slides.length === 0) {
        console.log(`- ${slug}: no source images available, skipping`);
        skipped++;
        continue;
      }

      const key = SLOT_KEY(slug);
      await prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: slides as unknown as Prisma.InputJsonValue,
        },
        update: {
          value: slides as unknown as Prisma.InputJsonValue,
        },
      });
      console.log(`~ Set ${key} (${slides.length} slides)`);
      touched++;
    }

    console.log('');
    console.log(`Touched: ${touched}, skipped: ${skipped}, total: ${SEED_SLUGS.length}`);
    console.log('');
    console.log('Verify:');
    console.log('  curl https://api.afrizonemart.com/api/content | jq \'.overrides | to_entries[] | select(.key | startswith("content.category."))\'');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
