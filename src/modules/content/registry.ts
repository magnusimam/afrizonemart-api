/**
 * Site-content slot registry.
 *
 * Each entry defines a single editable piece of content the admin can
 * change without touching the codebase. Slots are grouped by page →
 * section so the admin form can render a navigable form. The storefront
 * fetches the current overrides at render time; defaults live in the
 * components themselves so a missing slot value falls back to the
 * existing hardcoded design.
 *
 * The same shape is mirrored on the storefront in
 * `afrizonemart-v2/src/lib/site-content/registry.ts` (kept in sync
 * manually until we extract a shared workspace package).
 */

export type SlotKind =
  | 'text' // single-line string
  | 'longText' // multi-line, plain text
  | 'image' // single image URL (R2 / public path), no alt
  | 'imageWithAlt' // { url, alt }
  | 'imageList' // [{ url, alt }, ...]
  | 'number' // integer
  | 'boolean'; // toggle

export interface SlotDef {
  key: string;
  label: string;
  /// Group label — e.g. "Homepage". Drives the admin form's outer
  /// section grouping.
  page: string;
  /// Sub-group inside the page — e.g. "Hero" or "Groceries shelf".
  section: string;
  kind: SlotKind;
  /// Helper text shown under the input.
  hint?: string;
  /// Validation hints (used for number kinds).
  min?: number;
  max?: number;
}

/**
 * The full slot list. Add new entries here; the admin UI updates
 * automatically. Keys must start with "content." to match the storage
 * prefix in the Setting table.
 *
 * Conventions:
 *   - Lowercase + dotted: content.<page>.<section>.<field>
 *   - Group order = display order.
 */
export const SITE_CONTENT_SLOTS: readonly SlotDef[] = [
  // ----- Homepage / Hero -----
  {
    key: 'content.home.hero.slides',
    label: 'Hero slider images',
    page: 'Homepage',
    section: 'Hero',
    kind: 'imageList',
    hint: 'The rotating banner at the top. Each slide is an image + alt text.',
  },

  // ----- Homepage / Groceries shelf -----
  {
    key: 'content.home.products.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Groceries shelf',
    kind: 'text',
    hint: 'Navy band text above the product grid.',
  },
  {
    key: 'content.home.products.deliveryNote',
    label: 'Delivery note',
    page: 'Homepage',
    section: 'Groceries shelf',
    kind: 'longText',
    hint: 'Amber strip under the headline. HTML supported (use <strong> for emphasis).',
  },

  // ----- Homepage / Country marquee -----
  {
    key: 'content.home.shopByCountry.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Shop by country',
    kind: 'text',
  },

  // ----- Homepage / Deals shelf -----
  {
    key: 'content.home.deals.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Deals shelf',
    kind: 'text',
  },

  // ----- Homepage / Favourites shelf -----
  {
    key: 'content.home.favourites.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Favourites shelf',
    kind: 'text',
  },

  // ----- Homepage / Shop by category -----
  {
    key: 'content.home.shopByCategory.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Shop by category',
    kind: 'text',
  },

  // ----- Homepage / Female products shelf -----
  {
    key: 'content.home.female.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'For Her shelf',
    kind: 'text',
  },

  // ----- Homepage / Purchase big shelf -----
  {
    key: 'content.home.purchaseBig.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Buy Big shelf',
    kind: 'text',
  },

  // ----- Homepage / Books shelf -----
  {
    key: 'content.home.books.headline',
    label: 'Headline',
    page: 'Homepage',
    section: 'Books shelf',
    kind: 'text',
  },

  // ----- Homepage / Brand banner -----
  {
    key: 'content.home.brandBanner.image',
    label: 'Banner image',
    page: 'Homepage',
    section: 'Made-in-Africa banner',
    kind: 'imageWithAlt',
    hint: 'Full-width banner that sits between the Buy Big and Books shelves.',
  },

  // ----- Homepage / Satisfaction strip -----
  {
    key: 'content.home.satisfactionStrip.text',
    label: 'Strip text',
    page: 'Homepage',
    section: 'Satisfaction strip',
    kind: 'text',
    hint: 'Single line on the amber strip near the bottom of the page.',
  },
];

export const SLOT_KEYS = SITE_CONTENT_SLOTS.map((s) => s.key);

export function isKnownSlot(key: string): boolean {
  return SLOT_KEYS.includes(key);
}

export function getSlot(key: string): SlotDef | undefined {
  return SITE_CONTENT_SLOTS.find((s) => s.key === key);
}
