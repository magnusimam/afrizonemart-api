/**
 * Seeds the page-builder "home" page so admins see the existing
 * homepage layout in the builder UI from day one.
 *
 * Idempotent — running twice deletes the previous "home" page (with
 * its sections + revisions via cascade) and recreates with the
 * canonical 17-section layout. This makes it safe to run after schema
 * changes or new section types land.
 *
 * Usage (against any DB):
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-home-page.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedSection {
  type: string;
  position: number;
  visible?: boolean;
  headline?: string | null;
  subheadline?: string | null;
  accentColor?: string | null;
  config: unknown;
}

const HOME_SECTIONS: SeedSection[] = [
  // 1. Hero — top-of-fold carousel
  {
    type: 'hero',
    position: 0,
    config: {
      autoplayMs: 5000,
      showDots: true,
      slides: [
        {
          imageUrl: '/images/hero/slide-world-map.jpg',
          imageAlt: 'From Africa to the rest of the world',
          eyebrow: 'Made in Africa',
          headline: 'From Africa to the rest of the world',
          subheadline: 'Discover authentic products from across the continent.',
          ctaLabel: 'Shop now',
          ctaHref: '/shop',
        },
        {
          imageUrl: '/images/hero/slide-just-for-you.jpg',
          imageAlt: 'Just For You — featured African fashion',
          eyebrow: 'Featured',
          headline: 'Just For You',
          subheadline: 'Hand-picked African fashion in your size and style.',
          ctaLabel: 'Browse fashion',
          ctaHref: '/shop/fashion',
        },
        {
          imageUrl: '/images/hero/slide-everything-africa.jpg',
          imageAlt: 'Buy everything made in Africa',
          eyebrow: 'AfCFTA',
          headline: 'Buy everything made in Africa',
          subheadline: 'Continental Free Trade Agreement — 100% Made in Africa.',
          ctaHref: '/shop',
        },
        {
          imageUrl: '/images/hero/slide-for-her.jpg',
          imageAlt: 'For Her',
          eyebrow: 'For Her',
          headline: 'Everything for women, beautifully discounted',
          ctaLabel: 'Shop for her',
          ctaHref: '/shop/beauty',
        },
        {
          imageUrl: '/images/hero/slide-groceries.jpg',
          imageAlt: 'Groceries & Beverages',
          eyebrow: 'Pantry',
          headline: 'African groceries delivered',
          subheadline: 'From jollof essentials to artisan condiments.',
          ctaLabel: 'Shop groceries',
          ctaHref: '/shop/groceries',
        },
      ],
    },
  },

  // 2. "Everything Made in Africa" — categories scroll strip
  {
    type: 'category-shelf',
    position: 1,
    headline: 'Everything Made in Africa',
    accentColor: 'amber',
    config: {
      categorySlugs: [
        'for-her',
        'for-him',
        'beer-wines-spirit',
        'interior-decor',
        'groceries',
        'art-collectibles',
        'beauty',
      ],
      layout: 'scroll',
    },
  },

  // 3. Shop By Country — twin marquee
  {
    type: 'country-shelf',
    position: 2,
    config: { headline: 'Shop By Country', countryCodes: [] },
  },

  // 4. Groceries grid
  {
    type: 'product-grid',
    position: 3,
    headline: 'Groceries, Food & Beverages',
    subheadline: 'African pantry essentials, drinks, and snacks.',
    accentColor: 'amber',
    config: {
      source: { kind: 'category', categorySlug: 'groceries' },
      columns: 4,
      rows: 2,
      viewAllHref: '/shop/groceries',
      viewAllLabel: 'View all groceries',
    },
  },

  // 5. Today's Deals
  {
    type: 'product-grid',
    position: 4,
    headline: "Today's Deals",
    subheadline: 'Limited-time discounts across the catalogue.',
    accentColor: 'danger',
    config: {
      source: { kind: 'on-sale' },
      columns: 4,
      rows: 1,
      viewAllHref: '/deals',
      viewAllLabel: 'See all deals',
    },
  },

  // 6. Customer Favourites (latest)
  {
    type: 'product-grid',
    position: 5,
    headline: 'Customer Favourites',
    accentColor: 'navy',
    config: {
      source: { kind: 'new-arrivals' },
      columns: 4,
      rows: 2,
      viewAllHref: '/new-arrivals',
      viewAllLabel: 'View new arrivals',
    },
  },

  // 7. Shop By Category — large feature cards
  {
    type: 'feature-cards',
    position: 6,
    headline: 'Shop By Category',
    accentColor: 'navy',
    config: {
      cardsPerRow: 3,
      cards: [
        {
          imageUrl: '/images/shop-by-category/home-essentials.jpeg',
          imageAlt: 'Home Essentials',
          name: 'Home Essentials',
          description: 'Stock up your home with quality home furniture and appliances.',
          href: '/shop/home-essentials',
          ctaLabel: 'Explore',
        },
        {
          imageUrl: '/images/shop-by-category/electronics.jpeg',
          imageAlt: 'Electrical & Electronic Appliances',
          name: 'Electrical & Electronic Appliances',
          description: 'Purchase durable electrical appliances for your pleasure.',
          href: '/shop/electronics',
          ctaLabel: 'Explore',
        },
        {
          imageUrl: '/images/shop-by-category/fashion.jpeg',
          imageAlt: 'Fashion',
          name: 'Fashion',
          description: 'African-made apparel, accessories, and footwear.',
          href: '/shop/fashion',
          ctaLabel: 'Explore',
        },
      ],
    },
  },

  // 8. Custom-quote form
  {
    type: 'quotation-form',
    position: 7,
    config: {
      headline: 'Need a custom quote?',
      subheadline: 'Bulk orders, B2B partnerships, or one-off requests — we will respond within 24 hours.',
    },
  },

  // 9. For Her — beauty grid
  {
    type: 'product-grid',
    position: 8,
    headline: 'For Her',
    subheadline: 'Beauty + personal care from across the continent.',
    accentColor: '#E91E63',
    config: {
      source: { kind: 'category', categorySlug: 'beauty' },
      columns: 4,
      rows: 1,
      viewAllHref: '/shop/beauty',
      viewAllLabel: 'View all beauty',
    },
  },

  // 10. Buy Big — interior decor
  {
    type: 'product-grid',
    position: 9,
    headline: 'Buy Big — Home & Interior',
    accentColor: 'amber',
    config: {
      source: { kind: 'category', categorySlug: 'interior-decor' },
      columns: 4,
      rows: 1,
      viewAllHref: '/shop/interior-decor',
      viewAllLabel: 'Shop home',
    },
  },

  // 11. Made-in-Africa brand banner
  {
    type: 'image-banner',
    position: 10,
    config: {
      imageUrl: '/images/banner-made-in-africa.png',
      imageAlt: 'AfriZoneMart.com — Remember, if it is made in Africa, It is made for you!',
      width: 'full',
    },
  },

  // 12. Books & Knowledge
  {
    type: 'product-grid',
    position: 11,
    headline: 'Books & Knowledge',
    accentColor: 'info',
    config: {
      source: { kind: 'category', categorySlug: 'books' },
      columns: 4,
      rows: 1,
      viewAllHref: '/shop/books',
      viewAllLabel: 'View all books',
    },
  },

  // 13. Services + gift cards
  {
    type: 'services-grid',
    position: 12,
    config: {
      heroCard: {
        imageUrl: '/images/services/gift-cards.jpg',
        imageAlt: 'Gift Cards Available',
        href: '/gift-cards',
      },
      services: [
        { icon: 'shield-check', name: 'Trade Assurance', href: '/services/trade-assurance' },
        { icon: 'graduation-cap', name: 'AfWBM Program', href: '/services/afwbm-program' },
        { icon: 'bar-chart-3', name: 'Product Monitoring', href: '/services/product-monitoring' },
        { icon: 'truck', name: 'Logistics Services', href: '/services/logistics' },
      ],
    },
  },

  // 14. Mixed categories — feature cards
  {
    type: 'feature-cards',
    position: 13,
    headline: 'More to Explore',
    accentColor: 'amber',
    config: {
      cardsPerRow: 3,
      cards: [
        {
          imageUrl: '/images/services/baby.jpg',
          imageAlt: 'For Babies',
          name: 'For Babies',
          description: 'A healthy child is a second future. Keep your baby healthy with our safe-to-use baby products.',
          href: '/shop/babies',
          ctaLabel: 'Shop Now',
        },
        {
          imageUrl: '/images/services/hair.jpg',
          imageAlt: 'Hair & Accessories',
          name: 'Hair & Accessories',
          description: 'Give your hair the best treatment with our wide range of hair products and accessories.',
          href: '/shop/hair-accessories',
          ctaLabel: 'Shop Now',
        },
        {
          imageUrl: '/images/services/digital.jpg',
          imageAlt: 'Digital Content',
          name: 'Digital Content',
          description: 'Music, e-books, and digital downloads from African creators.',
          href: '/shop/digital',
          ctaLabel: 'Browse',
        },
      ],
    },
  },

  // 15. Satisfaction strip
  {
    type: 'text-strip',
    position: 14,
    accentColor: 'amber',
    config: { text: 'For Your Ultimate Satisfaction' },
  },

  // 16. Trust bar
  {
    type: 'trust-bar',
    position: 15,
    config: {
      items: [
        { icon: 'truck', label: 'Free shipping', sublabel: 'On orders over ₦10,000' },
        { icon: 'shield-check', label: '30-day returns', sublabel: 'No-questions-asked' },
        { icon: 'globe', label: 'Made in Africa', sublabel: 'Sourced direct from artisans' },
        { icon: 'badge-check', label: 'Quality-checked', sublabel: 'Every product verified' },
      ],
    },
  },

  // 17. Newsletter signup
  {
    type: 'newsletter',
    position: 16,
    config: {
      headline: 'Stay in the loop',
      subheadline: 'New arrivals, deals, and African product stories.',
      ctaLabel: 'Subscribe',
    },
  },
];

async function main() {
  // Wipe + recreate so the script is idempotent across schema iterations.
  // Cascading delete removes sections + revisions automatically.
  await prisma.page.deleteMany({ where: { slug: 'home' } });

  const page = await prisma.page.create({
    data: {
      slug: 'home',
      title: 'Homepage',
      description:
        'The default landing page. Edit sections to control what shoppers see when they land on the site.',
      publishedAt: new Date(),
      sections: {
        create: HOME_SECTIONS.map((s) => ({
          type: s.type,
          position: s.position,
          visible: s.visible ?? true,
          headline: s.headline ?? null,
          subheadline: s.subheadline ?? null,
          accentColor: s.accentColor ?? null,
          config: s.config as object,
        })),
      },
    },
    include: { sections: true },
  });

  await prisma.pageRevision.create({
    data: {
      pageId: page.id,
      snapshot: page.sections.map((s) => ({
        type: s.type,
        position: s.position,
        visible: s.visible,
        headline: s.headline,
        subheadline: s.subheadline,
        accentColor: s.accentColor,
        config: s.config,
        startsAt: null,
        endsAt: null,
        countries: [],
      })) as unknown as object,
      authorEmail: 'system@afrizonemart.com',
      note: 'Initial seed — full 17-section homepage',
    },
  });

  console.log(`[seed] Home page (re)created with ${page.sections.length} sections.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
