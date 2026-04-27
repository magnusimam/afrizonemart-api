/**
 * Phase 10.7 — Placement registry.
 *
 * The fixed catalogue of "where on the site can a product be featured?".
 * Admin form reads this list (plus dynamic CMS-page entries) to render
 * the placement picker. Frontend pages query the API by these keys.
 *
 * Adding a new placement is one entry here + one piece of frontend code
 * that asks for products with that placement. No schema change needed.
 */
export interface PlacementDef {
  key: string;
  label: string;
  description: string;
  group: PlacementGroup;
}

export type PlacementGroup =
  | 'pages'
  | 'homepage_shelves'
  | 'curated_lists'
  | 'cms_pages';

export const PLACEMENT_REGISTRY: PlacementDef[] = [
  // ------------ Featured pages ------------
  {
    key: 'homepage_hero',
    label: 'Homepage hero',
    description: 'Pinned to the big rotating hero on the storefront homepage.',
    group: 'pages',
  },
  {
    key: 'homepage_featured',
    label: 'Homepage featured row',
    description: 'Appears in the "Featured today" rail just below the hero.',
    group: 'pages',
  },
  {
    key: 'special_discount_top',
    label: 'Special Discount — top picks',
    description: 'Top of the /special-discount page above the category shelves.',
    group: 'pages',
  },
  {
    key: 'todays_deals_pick',
    label: "Today's Deals — staff pick",
    description: "Pinned to the top of the /deals page regardless of price.",
    group: 'pages',
  },
  {
    key: 'new_arrivals_pin',
    label: 'New Arrivals — pin',
    description:
      'Forces this product onto /new-arrivals even if it was created more than 30 days ago.',
    group: 'pages',
  },
  {
    key: 'continental_rewards_featured',
    label: 'Continental Rewards — member exclusive',
    description: 'Shown to logged-in members on /continental-rewards.',
    group: 'pages',
  },

  // ------------ Homepage shelves ------------
  {
    key: 'shelf_for_her',
    label: 'Shelf — For Her',
    description: 'Curated "For Her" homepage rail.',
    group: 'homepage_shelves',
  },
  {
    key: 'shelf_for_him',
    label: 'Shelf — For Him',
    description: 'Curated "For Him" homepage rail.',
    group: 'homepage_shelves',
  },
  {
    key: 'shelf_home_essentials',
    label: 'Shelf — Home Essentials',
    description: 'Curated "Home Essentials" homepage rail.',
    group: 'homepage_shelves',
  },
  {
    key: 'shelf_groceries',
    label: 'Shelf — Groceries pick',
    description: 'Curator override for the homepage groceries section.',
    group: 'homepage_shelves',
  },
  {
    key: 'shelf_books',
    label: 'Shelf — Books pick',
    description: 'Curator override for the homepage books section.',
    group: 'homepage_shelves',
  },

  // ------------ Curated lists ------------
  {
    key: 'staff_picks',
    label: 'Staff Picks',
    description: 'Hand-picked by Afrizonemart staff.',
    group: 'curated_lists',
  },
  {
    key: 'best_of_africa',
    label: 'Best of Africa',
    description: 'A rotating curation of standout African products.',
    group: 'curated_lists',
  },
  {
    key: 'editors_choice',
    label: "Editor's Choice",
    description: 'Marketing-team selection for major campaigns.',
    group: 'curated_lists',
  },
  {
    key: 'limited_edition',
    label: 'Limited Edition',
    description: 'Tagged as scarce / time-limited so the UI can highlight scarcity.',
    group: 'curated_lists',
  },
  {
    key: 'bestseller',
    label: 'Bestseller',
    description: 'Manually flagged as a bestseller (overrides auto-derivation).',
    group: 'curated_lists',
  },
  {
    key: 'exclusive',
    label: 'Afrizonemart Exclusive',
    description: 'Available only at Afrizonemart.',
    group: 'curated_lists',
  },
];

export const REGISTRY_BY_KEY: Record<string, PlacementDef> = Object.fromEntries(
  PLACEMENT_REGISTRY.map((p) => [p.key, p]),
);

export function isStaticKey(key: string): boolean {
  return key in REGISTRY_BY_KEY;
}

export function isCmsKey(key: string): boolean {
  return key.startsWith('cms:');
}

/**
 * Validates a placement key. CMS keys must point at a real published page;
 * the caller passes in the list of valid CMS slugs to check against.
 */
export function isValidKey(key: string, validCmsSlugs: Set<string>): boolean {
  if (isStaticKey(key)) return true;
  if (isCmsKey(key)) return validCmsSlugs.has(key.slice(4));
  return false;
}

export const PLACEMENT_GROUP_LABELS: Record<PlacementGroup, string> = {
  pages: 'Featured pages',
  homepage_shelves: 'Homepage shelves',
  curated_lists: 'Curated lists',
  cms_pages: 'Custom CMS pages',
};
