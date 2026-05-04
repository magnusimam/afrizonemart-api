/**
 * Seeds Page rows for the other static landing pages with FULL visual
 * indexing — every headline, paragraph, image, banner, list, and CTA
 * from the existing fallback layouts is captured as an editable
 * section. Admins can edit any text, swap any image, or remove/reorder
 * any block from /admin/site-pages.
 *
 * Idempotent — wipes + recreates each page so re-running picks up
 * latest seed config.
 *
 * Pages remain unpublished by default (publish: false) so the
 * hardcoded fallback keeps rendering until an admin clicks Publish.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-other-pages.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SectionSeed {
  type: string;
  position: number;
  visible?: boolean;
  headline?: string | null;
  subheadline?: string | null;
  accentColor?: string | null;
  config: unknown;
}

interface PageSeed {
  slug: string;
  title: string;
  description: string;
  publish: boolean;
  sections: SectionSeed[];
}

const PAGES: PageSeed[] = [
  // ---- /shop ----------------------------------------------------------
  {
    slug: 'shop',
    title: 'Shop — Catalog',
    description:
      'Main catalog landing. The functional filters/pagination stay in code; everything visual here is editable.',
    publish: false,
    sections: [
      {
        type: 'rich-text',
        position: 0,
        accentColor: 'amber',
        config: {
          align: 'left',
          html: '<p class="font-raleway text-xs font-semibold uppercase tracking-btn text-amber">Shop everything made in Africa</p><h1 class="font-raleway text-3xl font-bold text-navy md:text-4xl mt-2">All Products</h1><p class="font-sans text-sm text-muted md:text-base mt-2">Discover authentic African-made products from 54+ countries.</p>',
        },
      },
      {
        type: 'category-shelf',
        position: 1,
        headline: 'Browse by category',
        accentColor: 'navy',
        config: {
          categorySlugs: ['groceries', 'beauty', 'fashion', 'books', 'interior-decor'],
          layout: 'scroll',
        },
      },
      {
        type: 'product-grid',
        position: 2,
        headline: 'New this week',
        accentColor: 'amber',
        config: {
          source: { kind: 'new-arrivals' },
          columns: 4,
          rows: 2,
        },
      },
    ],
  },

  // ---- /deals --------------------------------------------------------
  {
    slug: 'deals',
    title: 'Deals',
    description:
      "Today's-deals landing page. Hero copy, banner images, and shelf headlines are all editable here. The deal-timer and live count UI stays in code.",
    publish: false,
    sections: [
      {
        type: 'final-cta',
        position: 0,
        config: {
          eyebrow: 'On sale right now',
          headline: "Today's Deals",
          body: "Every product on this page is currently discounted. Hand-picked Made-in-Africa goods at prices you won't see again next week.",
          background: 'gradient-navy',
          primaryCta: null,
          secondaryCta: null,
        },
      },
      {
        type: 'product-grid',
        position: 1,
        headline: 'Staff picks today',
        subheadline: 'Hand-selected by Afrizonemart curators.',
        accentColor: 'amber',
        config: {
          source: { kind: 'placement', placementKey: 'todays_deals_pick' },
          columns: 4,
          rows: 1,
        },
      },
      {
        type: 'product-grid',
        position: 2,
        headline: 'On Sale Now',
        accentColor: 'danger',
        config: {
          source: { kind: 'on-sale' },
          columns: 4,
          rows: 3,
          viewAllHref: '/deals',
          viewAllLabel: 'See more deals',
        },
      },
      {
        type: 'image-banner',
        position: 3,
        headline: 'Made in Africa banner',
        config: {
          imageUrl: '/images/discount/made-in-africa.png',
          imageAlt: 'Remember, if it is made in Africa, it is made for you!',
          width: 'container',
        },
      },
      {
        type: 'image-banner',
        position: 4,
        headline: 'Buy now, pay later banner',
        config: {
          imageUrl: '/images/discount/bnpl.webp',
          imageAlt: "Don't forget — you can just Buy Now Pay Later when checking out",
          href: '/checkout',
          width: 'container',
        },
      },
      {
        type: 'trust-bar',
        position: 5,
        config: {
          items: [
            { icon: 'truck', label: 'Free shipping', sublabel: 'On orders over ₦10,000' },
            { icon: 'shield-check', label: '30-day returns', sublabel: 'No-questions-asked' },
            { icon: 'globe', label: 'Made in Africa', sublabel: 'Sourced direct from artisans' },
            { icon: 'badge-check', label: 'Quality-checked', sublabel: 'Every product verified' },
          ],
        },
      },
    ],
  },

  // ---- /new-arrivals -------------------------------------------------
  {
    slug: 'new-arrivals',
    title: 'New Arrivals',
    description:
      'Latest products from across the continent. Hero copy + intro shelf headlines are editable; the drop counter + Africa map remain functional.',
    publish: false,
    sections: [
      {
        type: 'final-cta',
        position: 0,
        config: {
          eyebrow: 'Just landed from Africa',
          headline: "This week's arrivals.",
          body: "Hand-picked drops from makers across the continent. Curated, captioned, and shipped from where it's made.",
          background: 'amber',
          primaryCta: { label: 'Shop new arrivals', href: '#new' },
          secondaryCta: { label: 'Get drop alerts', href: '#subscribe' },
        },
      },
      {
        type: 'africa-map',
        position: 1,
        headline: 'Where our products come from',
        config: {
          headline: 'Where our products come from',
          subheadline: 'Tap a country to jump to its arrivals — or to be notified when it launches.',
        },
      },
      {
        type: 'product-grid',
        position: 2,
        headline: "Editors' pin",
        subheadline: 'Pinned arrivals from our editors — overrides the 30-day window.',
        accentColor: 'amber',
        config: {
          source: { kind: 'placement', placementKey: 'new_arrivals_pin' },
          columns: 4,
          rows: 1,
        },
      },
      {
        type: 'product-grid',
        position: 3,
        headline: 'Just landed',
        accentColor: 'navy',
        config: {
          source: { kind: 'new-arrivals' },
          columns: 4,
          rows: 3,
        },
      },
      {
        type: 'trust-bar',
        position: 4,
        config: {
          items: [
            { icon: 'truck', label: 'Free shipping', sublabel: 'On orders over ₦10,000' },
            { icon: 'shield-check', label: '30-day returns', sublabel: 'No-questions-asked' },
            { icon: 'globe', label: 'Made in Africa', sublabel: 'Sourced direct from artisans' },
            { icon: 'badge-check', label: 'Quality-checked', sublabel: 'Every product verified' },
          ],
        },
      },
    ],
  },

  // ---- /special-discount ---------------------------------------------
  {
    slug: 'special-discount',
    title: 'Special Discount',
    description:
      'Site-wide promo landing. Every banner, marquee item, shelf headline, and CTA below is editable.',
    publish: false,
    sections: [
      {
        type: 'image-banner',
        position: 0,
        headline: 'Hero banner',
        config: {
          imageUrl: '/images/discount/hero-2026.jpg',
          imageAlt: 'Get special discounts today',
          width: 'full',
          overlayHeadline: 'Special Discounts on Everything Made in Africa',
          overlayCtaLabel: 'Shop the deals',
          href: '/deals',
        },
      },
      {
        type: 'marquee-strip',
        position: 1,
        config: {
          items: [
            'Up to 50% off Beauty',
            '🎁 Free shipping over ₦15,000',
            'Up to 40% off Fashion',
            '⚡ Buy Now, Pay Later at checkout',
            'Up to 35% off Home & Decor',
            '⭐ Earn double Continental points',
          ],
          background: 'amber',
          durationSeconds: 30,
        },
      },
      {
        type: 'product-grid',
        position: 2,
        headline: "Curators' picks",
        subheadline: 'The deals our team thinks are the best buys this week.',
        accentColor: 'amber',
        config: {
          source: { kind: 'placement', placementKey: 'special_discount_top' },
          columns: 4,
          rows: 1,
        },
      },
      {
        type: 'product-grid',
        position: 3,
        headline: 'Beauty',
        subheadline: 'Up to 50% OFF',
        accentColor: '#E11D74',
        config: {
          source: { kind: 'category', categorySlug: 'beauty' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop/beauty',
          viewAllLabel: 'Shop all beauty',
        },
      },
      {
        type: 'product-grid',
        position: 4,
        headline: 'Fashion',
        subheadline: 'Up to 40% OFF',
        accentColor: '#7C3AED',
        config: {
          source: { kind: 'category', categorySlug: 'fashion' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop/fashion',
          viewAllLabel: 'Shop all fashion',
        },
      },
      {
        type: 'product-grid',
        position: 5,
        headline: 'Food & Groceries',
        subheadline: 'Up to 30% OFF',
        accentColor: '#16A34A',
        config: {
          source: { kind: 'category', categorySlug: 'groceries' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop/groceries',
          viewAllLabel: 'Shop all groceries',
        },
      },
      {
        type: 'image-banner',
        position: 6,
        headline: '"Made in Africa" banner',
        config: {
          imageUrl: '/images/discount/made-in-africa.png',
          imageAlt: 'Remember, if it is made in Africa, it is made for you!',
          width: 'container',
        },
      },
      {
        type: 'product-grid',
        position: 7,
        headline: 'Home & Decor',
        subheadline: 'Up to 35% OFF',
        accentColor: '#0EA5E9',
        config: {
          source: { kind: 'category', categorySlug: 'interior-decor' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop/interior-decor',
          viewAllLabel: 'Shop all home & decor',
        },
      },
      {
        type: 'product-grid',
        position: 8,
        headline: 'Books & Media',
        subheadline: 'Up to 25% OFF',
        accentColor: '#F59E0B',
        config: {
          source: { kind: 'category', categorySlug: 'books' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop/books',
          viewAllLabel: 'Shop all books',
        },
      },
      {
        type: 'product-grid',
        position: 9,
        headline: 'All Specials',
        subheadline: 'Hand-picked deals',
        accentColor: 'navy',
        config: {
          source: { kind: 'on-sale' },
          columns: 6,
          rows: 1,
          viewAllHref: '/shop',
          viewAllLabel: 'Browse all',
        },
      },
      {
        type: 'image-banner',
        position: 10,
        headline: '"Buy now, pay later" banner',
        config: {
          imageUrl: '/images/discount/bnpl.webp',
          imageAlt: "Don't forget — you can just Buy Now Pay Later when checking out",
          href: '/checkout',
          width: 'container',
        },
      },
      {
        type: 'final-cta',
        position: 11,
        config: {
          eyebrow: 'Limited time',
          headline: 'Stack savings with Continental Rewards',
          body: 'Members earn extra points on every discounted purchase — climb from Continental Blue all the way to Dorime and unlock exclusive perks.',
          background: 'gradient-navy',
          primaryCta: { label: 'See reward tiers', href: '/continental-rewards' },
          secondaryCta: { label: 'Create an account', href: '/register' },
        },
      },
      {
        type: 'trust-bar',
        position: 12,
        config: {
          items: [
            { icon: 'truck', label: 'Free shipping', sublabel: 'On orders over ₦10,000' },
            { icon: 'shield-check', label: '30-day returns', sublabel: 'No-questions-asked' },
            { icon: 'globe', label: 'Made in Africa', sublabel: 'Sourced direct from artisans' },
            { icon: 'badge-check', label: 'Quality-checked', sublabel: 'Every product verified' },
          ],
        },
      },
    ],
  },

  // ---- /continental-rewards ------------------------------------------
  {
    slug: 'continental-rewards',
    title: 'Continental Rewards',
    description:
      'Loyalty landing page. Hero copy, all 5 tier images + intros + perks, the registration CTAs, and the trust bar are all editable.',
    publish: false,
    sections: [
      {
        type: 'rich-text',
        position: 0,
        accentColor: 'amber',
        config: {
          align: 'center',
          html: '<h1 class="font-raleway text-3xl font-bold text-amber md:text-5xl">Continental Rewards</h1><p class="mx-auto mt-4 max-w-2xl font-sans text-base leading-relaxed text-charcoal md:text-lg">As a continental reward member, you will experience shopping with customer service at its finest. The more you shop here on Afrizonemart.com, the faster you earn sufficient points to redeem for a shopping voucher or gift card and advance to the next level.</p>',
        },
      },
      {
        type: 'rewards-tiers',
        position: 1,
        accentColor: 'amber',
        config: {
          layout: 'ladder',
          tiers: [
            {
              name: 'Continental Blue',
              minPoints: 0,
              accentColor: 'navy',
              imageUrl: '/images/loyalty/blue.jpg',
              imageAlt: 'Continental Blue loyalty card',
              intro: 'Sign up now and enjoy exclusive Continental Blue benefits:',
              perks: [
                '5% discount on your first 3 purchases',
                'Free shipping on your first 5 purchases',
                'An AfrizoneMart souvenir',
              ],
              readMoreHref: '/continental-rewards#blue',
              readMoreLabel: 'Read full Continental Blue benefits',
            },
            {
              name: 'Continental Gold',
              minPoints: 50000,
              accentColor: 'amber',
              imageUrl: '/images/loyalty/gold.jpg',
              imageAlt: 'Continental Gold loyalty card',
              intro:
                'Shop ₦50,000+ in a year and unlock Continental Gold status with the following benefits:',
              perks: [
                'Birthday souvenirs',
                'Anniversary packages',
                'Plus all Continental Blue benefits',
              ],
              readMoreHref: '/continental-rewards#gold',
              readMoreLabel: 'Read full Continental Gold benefits',
            },
            {
              name: 'Continental VIP',
              minPoints: 100000,
              accentColor: '#9CA3AF',
              imageUrl: '/images/loyalty/vip.jpg',
              imageAlt: 'Continental VIP loyalty card',
              intro:
                'Shop ₦100,000+ in a year and enjoy Continental VIP status with benefits like:',
              perks: ['Dinner for two', 'Plus all Continental Blue and Gold incentives'],
              readMoreHref: '/continental-rewards#vip',
              readMoreLabel: 'Read full Continental VIP benefits',
            },
            {
              name: 'Continental Ambassador',
              minPoints: 500000,
              accentColor: '#5B2A86',
              imageUrl: '/images/loyalty/ambassador.jpg',
              imageAlt: 'Continental Ambassador loyalty card',
              intro:
                'Shop ₦500,000+ in a year and enjoy Continental Ambassador status with benefits like:',
              perks: [
                'Goat or Turkey or Ram festive package',
                'Plus all Continental Blue, Gold and VIP benefits',
              ],
              readMoreHref: '/continental-rewards#ambassador',
              readMoreLabel: 'Read full Continental Ambassador benefits',
            },
            {
              name: 'Continental Dorime',
              minPoints: 1000000,
              accentColor: 'charcoal',
              imageUrl: '/images/loyalty/dorime.jpg',
              imageAlt: 'Continental Dorime loyalty card',
              intro:
                'Shop ₦1,000,000+ in a year and earn Continental Dorime — our top tier — with all-access perks:',
              perks: [
                'Personal account concierge',
                'Exclusive limited-edition gift drops',
                'Plus all Continental Blue, Gold, VIP and Ambassador benefits',
              ],
              readMoreHref: '/continental-rewards#dorime',
              readMoreLabel: 'Read full Continental Dorime benefits',
            },
          ],
        },
      },
      {
        type: 'product-grid',
        position: 2,
        headline: 'Member exclusives',
        subheadline: 'Reward-tier products curated for Continental members.',
        accentColor: 'amber',
        config: {
          source: { kind: 'placement', placementKey: 'continental_rewards_featured' },
          columns: 4,
          rows: 1,
        },
      },
      {
        type: 'cta-cards',
        position: 3,
        config: {
          cards: [
            {
              headline: 'New customer? Register now',
              subheadline: 'Start earning Continental Blue benefits in seconds.',
              href: '/register',
              background: 'amber',
            },
            {
              headline: 'Already a customer? Sign in',
              subheadline: 'Track your tier, points and redemptions.',
              href: '/login',
              background: 'navy',
            },
          ],
        },
      },
      {
        type: 'trust-bar',
        position: 4,
        config: {
          items: [
            { icon: 'truck', label: 'Free shipping', sublabel: 'On orders over ₦10,000' },
            { icon: 'shield-check', label: '30-day returns', sublabel: 'No-questions-asked' },
            { icon: 'globe', label: 'Made in Africa', sublabel: 'Sourced direct from artisans' },
            { icon: 'badge-check', label: 'Quality-checked', sublabel: 'Every product verified' },
          ],
        },
      },
    ],
  },
];

async function main() {
  for (const seed of PAGES) {
    await prisma.page.deleteMany({ where: { slug: seed.slug } });

    const page = await prisma.page.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        description: seed.description,
        publishedAt: seed.publish ? new Date() : null,
        sections: {
          create: seed.sections.map((s) => ({
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

    if (seed.publish) {
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
          note: 'Initial seed — full content audit',
        },
      });
    }

    console.log(
      `[seed] ${seed.publish ? 'Published' : 'Drafted'} "${seed.slug}" with ${seed.sections.length} sections.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
