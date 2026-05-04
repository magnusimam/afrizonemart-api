import { z } from 'zod';

/**
 * Registry of section types the storefront can render. Adding a new
 * type means: (1) add it here with a zod config schema, (2) write the
 * matching renderer in the storefront's section-renderer registry.
 *
 * The schemas validate the `config` JSON column when admins create or
 * edit a section. Frontend reads the same values without re-validating
 * because the API is the only writer.
 */

const productSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('category'), categorySlug: z.string().min(1) }),
  z.object({ kind: z.literal('subcategory'), subcategorySlug: z.string().min(1) }),
  z.object({ kind: z.literal('placement'), placementKey: z.string().min(1) }),
  z.object({ kind: z.literal('on-sale') }),
  z.object({ kind: z.literal('new-arrivals') }),
  z.object({ kind: z.literal('manual'), productSlugs: z.array(z.string().min(1)).min(1) }),
]);

const heroSlideSchema = z.object({
  imageUrl: z.string().url(),
  imageAlt: z.string().min(1, 'Alt text required for accessibility + SEO'),
  eyebrow: z.string().nullish(),
  headline: z.string().min(1),
  subheadline: z.string().nullish(),
  ctaLabel: z.string().nullish(),
  ctaHref: z.string().nullish(),
  // 'left' / 'center' / 'right'. Defaults to 'left' in the renderer.
  textAlign: z.enum(['left', 'center', 'right']).nullish(),
});

export const SECTION_CONFIG_SCHEMAS = {
  hero: z.object({
    slides: z.array(heroSlideSchema).min(1, 'At least one slide is required'),
    autoplayMs: z.number().int().min(0).max(60_000).default(6000),
    showDots: z.boolean().default(true),
  }),

  'product-grid': z.object({
    source: productSourceSchema,
    /// Number of columns at desktop width (mobile always halves).
    columns: z.number().int().min(2).max(6).default(4),
    /// Number of rows of products to render (limit = columns * rows).
    rows: z.number().int().min(1).max(6).default(2),
    /// Optional "View all" link below the grid.
    viewAllHref: z.string().nullish(),
    viewAllLabel: z.string().nullish(),
  }),

  'category-shelf': z.object({
    /// Renders a horizontal-scroll strip of category tiles.
    categorySlugs: z.array(z.string().min(1)).min(1),
    layout: z.enum(['grid', 'scroll']).default('grid'),
  }),

  'image-banner': z.object({
    imageUrl: z.string().url(),
    imageAlt: z.string().min(1),
    href: z.string().nullish(),
    /// Visible foreground text overlay; null = image only.
    overlayHeadline: z.string().nullish(),
    overlayCtaLabel: z.string().nullish(),
    /// "full" = edge-to-edge, "container" = max-width content area.
    width: z.enum(['full', 'container']).default('container'),
  }),

  'rich-text': z.object({
    /// Sanitised HTML — authored via the same TipTap editor used in the
    /// blog admin.
    html: z.string().min(1),
    align: z.enum(['left', 'center']).default('left'),
  }),

  'africa-map': z.object({
    /// Title above the interactive map.
    headline: z.string().nullish(),
    subheadline: z.string().nullish(),
  }),

  newsletter: z.object({
    headline: z.string().default('Stay in the loop'),
    subheadline: z.string().nullish(),
    ctaLabel: z.string().default('Subscribe'),
  }),

  'trust-bar': z.object({
    items: z
      .array(
        z.object({
          icon: z.string().min(1),
          label: z.string().min(1),
          sublabel: z.string().nullish(),
        }),
      )
      .min(1),
  }),

  'quotation-form': z.object({
    headline: z.string().default('Need a custom quote?'),
    subheadline: z.string().nullish(),
  }),

  /// Twin counter-scrolling marquee of country tiles (the homepage's
  /// "Shop By Country" section). Slugs map to the country-shop pages.
  'country-shelf': z.object({
    headline: z.string().default('Shop By Country'),
    /// ISO-2 codes — empty array uses every country in /lib/countries.
    countryCodes: z.array(z.string().length(2)).default([]),
  }),

  /// Big card grid with image + name + description + button. Used for
  /// "Shop By Category" and "Mixed Categories" — different content,
  /// same layout. One to three cards per row depending on `cardsPerRow`.
  'feature-cards': z.object({
    cardsPerRow: z.number().int().min(1).max(4).default(3),
    cards: z
      .array(
        z.object({
          imageUrl: z.string().url(),
          imageAlt: z.string().min(1),
          name: z.string().min(1),
          description: z.string().nullish(),
          href: z.string().min(1),
          ctaLabel: z.string().nullish(),
        }),
      )
      .min(1),
  }),

  /// Services strip — typically a "gift cards" hero card + a row of
  /// service tiles (Trade Assurance, Logistics, etc.). Each tile has
  /// an icon + label + link.
  'services-grid': z.object({
    /// Optional left-side hero card (gift-cards-style).
    heroCard: z
      .object({
        imageUrl: z.string().url(),
        imageAlt: z.string().min(1),
        href: z.string().min(1),
      })
      .nullish(),
    services: z
      .array(
        z.object({
          icon: z.string().min(1),
          name: z.string().min(1),
          href: z.string().min(1),
        }),
      )
      .min(1),
  }),

  /// Single-line accent banner (the homepage's "For Your Ultimate
  /// Satisfaction" amber strip). Background uses the section's
  /// accentColor; text is always white-on-color.
  'text-strip': z.object({
    text: z.string().min(1),
    /// Defaults to 'amber' if the section's accentColor isn't set.
    bgColor: z.string().nullish(),
  }),

  /// Loyalty / rewards tier ladder (Continental Rewards). Each tier
  /// has a name, point threshold, image, intro paragraph, perks list,
  /// and an accent color. Renders as a vertical timeline / horizontal
  /// cards strip depending on `layout`.
  'rewards-tiers': z.object({
    layout: z.enum(['ladder', 'cards']).default('cards'),
    tiers: z
      .array(
        z.object({
          name: z.string().min(1),
          minPoints: z.number().int().min(0),
          /// Hex like "#3B82F6" or palette key.
          accentColor: z.string().nullish(),
          imageUrl: z.string().url().nullish(),
          imageAlt: z.string().nullish(),
          /// One- or two-sentence introduction shown beside the image.
          /// Sets up the perks list ("Sign up now and enjoy ...").
          intro: z.string().nullish(),
          perks: z.array(z.string().min(1)).default([]),
          /// Optional "Read full benefits" link href.
          readMoreHref: z.string().nullish(),
          /// Label on that link.
          readMoreLabel: z.string().nullish(),
        }),
      )
      .min(1),
  }),

  /// Pair (or trio) of large action-card CTAs side-by-side. Each card
  /// has a headline, supporting line, and link. Used for "New customer?
  /// Register / Already a customer? Sign in" on Continental Rewards.
  'cta-cards': z.object({
    cards: z
      .array(
        z.object({
          headline: z.string().min(1),
          subheadline: z.string().nullish(),
          href: z.string().min(1),
          /// 'amber' / 'navy' / hex — defaults to amber (primary card)
          /// for the first, navy (secondary) for the rest.
          background: z.string().nullish(),
        }),
      )
      .min(1)
      .max(3),
  }),

  /// Auto-scrolling text marquee — endless horizontal ticker. The
  /// items list duplicates internally for the seamless loop.
  'marquee-strip': z.object({
    items: z.array(z.string().min(1)).min(1),
    /// 'amber' / 'navy' / 'danger' / hex.
    background: z.string().nullish(),
    /// Seconds to complete one full loop. Higher = slower.
    durationSeconds: z.number().min(5).max(120).default(30),
  }),

  /// Highlighted final-CTA panel — eyebrow + headline + supporting
  /// paragraph + 1–2 buttons. Bordered card on a contrasting
  /// background. Used as a closer at the bottom of landing pages.
  'final-cta': z.object({
    eyebrow: z.string().nullish(),
    headline: z.string().min(1),
    body: z.string().nullish(),
    /// 'navy' / 'amber' / 'gradient-navy' / hex — drives the panel
    /// background. Default 'navy'.
    background: z.string().nullish(),
    primaryCta: z
      .object({
        label: z.string().min(1),
        href: z.string().min(1),
      })
      .nullish(),
    secondaryCta: z
      .object({
        label: z.string().min(1),
        href: z.string().min(1),
      })
      .nullish(),
  }),
} as const;

export type SectionType = keyof typeof SECTION_CONFIG_SCHEMAS;
export const SECTION_TYPES = Object.keys(SECTION_CONFIG_SCHEMAS) as readonly SectionType[];

export function isKnownSectionType(t: string): t is SectionType {
  return Object.prototype.hasOwnProperty.call(SECTION_CONFIG_SCHEMAS, t);
}

/**
 * Validate the `config` blob against its type's schema. Throws a
 * ZodError if invalid; the error handler converts that to a 400.
 */
export function validateSectionConfig(type: string, config: unknown): unknown {
  if (!isKnownSectionType(type)) {
    throw new Error(`Unknown section type "${type}"`);
  }
  return SECTION_CONFIG_SCHEMAS[type].parse(config);
}
