import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Brands aren't a first-class entity yet — they live as a string on
 * Product. These helpers let admin tooling group products by brand to
 * surface logo coverage and bulk-set logos without touching every
 * product individually.
 */

export interface BrandSummary {
  /// Display name as stored on Product.brand. Trimmed; empty/null
  /// products are bucketed under "" and the UI shows them as "(no brand)".
  brand: string;
  productCount: number;
  /// Most-recent non-null logo URL across products of this brand. The
  /// idea: once one product in a brand has a logo, the same logo is
  /// almost always right for the rest. The admin sees this as a hint
  /// when deciding whether to bulk-set.
  brandImageUrl: string | null;
  brandImageAlt: string | null;
  /// Coverage — how many products in this brand have a logo set.
  /// Lets the admin sort by "needs work" easily.
  productsWithLogo: number;
}

export async function listBrands(): Promise<BrandSummary[]> {
  // Pull the columns we need; group + dedupe in JS. Brand strings are
  // a few hundred at most so this is cheap and avoids a tricky GROUP BY
  // with conditional aggregates.
  const rows = await prisma.product.findMany({
    select: {
      brand: true,
      brandImageUrl: true,
      brandImageAlt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const map = new Map<string, BrandSummary>();
  for (const r of rows) {
    const key = (r.brand ?? '').trim();
    let summary = map.get(key);
    if (!summary) {
      summary = {
        brand: key,
        productCount: 0,
        brandImageUrl: null,
        brandImageAlt: null,
        productsWithLogo: 0,
      };
      map.set(key, summary);
    }
    summary.productCount += 1;
    if (r.brandImageUrl) {
      summary.productsWithLogo += 1;
      // First non-null wins; rows are ordered by updatedAt desc so this
      // gives us the most recently set logo.
      summary.brandImageUrl = summary.brandImageUrl ?? r.brandImageUrl;
      summary.brandImageAlt = summary.brandImageAlt ?? r.brandImageAlt;
    }
  }

  return [...map.values()].sort((a, b) => {
    // Sort: brands missing a logo first, then by product count desc.
    // This puts the highest-impact gaps at the top of the list.
    const aMissing = a.productsWithLogo < a.productCount ? 0 : 1;
    const bMissing = b.productsWithLogo < b.productCount ? 0 : 1;
    if (aMissing !== bMissing) return aMissing - bMissing;
    return b.productCount - a.productCount;
  });
}

/**
 * Apply a brand logo to every product whose `brand` matches (case-
 * insensitive, trimmed). Returns the updated count. Pass an empty
 * brand string to target the "(no brand)" bucket — ADMIN must opt
 * into that explicitly.
 */
export async function setBrandLogo(args: {
  brand: string;
  brandImageUrl: string;
  brandImageAlt?: string | null;
}): Promise<{ affected: number }> {
  const trimmed = args.brand.trim();
  if (!args.brandImageUrl.trim()) {
    throw HttpError.badRequest('brandImageUrl is required');
  }

  // updateMany with a case-insensitive `equals` filter so admin can
  // type "Tara" and match "tara" / "TARA" / "Tara " seeded variations
  // without manual cleanup.
  const r = await prisma.product.updateMany({
    where: trimmed
      ? { brand: { equals: trimmed, mode: 'insensitive' } }
      : { OR: [{ brand: null }, { brand: '' }] },
    data: {
      brandImageUrl: args.brandImageUrl,
      brandImageAlt: args.brandImageAlt ?? null,
    },
  });
  return { affected: r.count };
}
