import Papa from 'papaparse';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { syncProductVariants } from './variants';

export interface BulkRowResult {
  row: number;
  slug?: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
}

export interface BulkUploadResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: BulkRowResult[];
  /** Names of CSV columns that didn't map to a known product field — they
   *  were stashed into each product's `attributes.customAttributes`. The
   *  admin can promote any of these to a proper CustomFieldDef later. */
  unknownColumns: string[];
}

type RawRow = Record<string, string | undefined>;

/** Columns the importer recognises as first-class product fields. Anything
 *  outside this set is treated as a custom attribute and stashed into
 *  `attributes.customAttributes.<name>` so the admin can decide later
 *  whether to promote it to a proper CustomFieldDef. */
const KNOWN_COLUMNS = new Set([
  'slug',
  'name',
  'brand',
  'shortDescription',
  'description',
  'ingredients',
  'price',
  'comparePrice',
  'origin',
  'inStock',
  'images',
  'category',
  'categorySlug',
  'subcategory',
  'subcategorySlug',
]);

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n']);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function parseBool(s: string | undefined, fallback: boolean): boolean {
  if (s === undefined) return fallback;
  const v = s.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return fallback;
}

function discountPercent(price: number, comparePrice: number | null): number | null {
  if (!comparePrice || comparePrice <= price) return null;
  return Math.round(((comparePrice - price) / comparePrice) * 100);
}

function defaultAttributes(p: { price: number; comparePrice: number | null; name: string; description?: string | null; brand?: string | null; origin?: string | null }) {
  const single = p.price;
  const triple = Math.round(single * 2.7);
  const six = Math.round(single * 5);
  return {
    bundles: [
      { units: 1, label: '1 Pack', price: single, comparePrice: p.comparePrice ?? single },
      { units: 3, label: '3 Pack', price: triple, comparePrice: single * 3, savings: 10, popular: true },
      { units: 6, label: '6 Pack', price: six, comparePrice: single * 6, savings: 17 },
    ],
    features: [
      { icon: 'globe', text: 'Sourced and made in Africa' },
      { icon: 'check', text: 'Quality-checked by Afrizonemart' },
      { icon: 'shield', text: '30-day no-questions-asked returns' },
    ],
    specifications: [
      { label: 'Origin', value: p.origin ?? '—' },
      { label: 'Brand', value: p.brand ?? 'Various' },
    ],
    aboutTitle: `About ${p.name}`,
    aboutBody:
      p.description ??
      'A quality product brought to you from across Africa. Discover authentic items from artisans, farmers, and brands you can trust — with every purchase supporting communities across the continent.',
    aboutImage: '/images/featured/for-her.jpg',
  };
}

/** Coerce a raw CSV string to the JSON shape a CustomFieldDef of the
 *  given type expects. NUMBER → number (when finite), BOOLEAN → bool,
 *  everything else stays a string. The storefront renderer tolerates
 *  strings too, but storing the right primitive keeps the data clean
 *  and makes future sorting/filtering on these fields possible. */
function coerceForType(raw: string, type: string): string | number | boolean {
  if (type === 'NUMBER') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === 'BOOLEAN') {
    const v = raw.toLowerCase();
    if (TRUE_VALUES.has(v)) return true;
    if (FALSE_VALUES.has(v)) return false;
    return raw;
  }
  return raw;
}

/** Splits a CSV row's non-standard columns into two buckets:
 *   - `promoted`: columns whose name exactly matches an active PRODUCT
 *     CustomFieldDef key. These go to TOP-LEVEL `attributes[key]` so the
 *     storefront's DynamicFieldList (which reads `attributes[def.key]`)
 *     renders them. Values are type-coerced per the def.
 *   - `custom`: everything else — stashed under
 *     `attributes.customAttributes.<name>` as a holding area the admin
 *     can later promote to a real def.
 *
 *  Header matching is exact (case-sensitive) by design — a column named
 *  `publicationYear` will NOT match a def keyed `publication_year`; it
 *  falls through to customAttributes and is reported in unknownColumns.
 *
 *  Empty values are skipped so a sparse spreadsheet doesn't wipe
 *  attributes already on the product. */
function splitCustomColumns(
  row: RawRow,
  defTypeByKey: Map<string, string>,
): { promoted: Record<string, string | number | boolean>; custom: Record<string, string> } {
  const promoted: Record<string, string | number | boolean> = {};
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key || KNOWN_COLUMNS.has(key)) continue;
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const defType = defTypeByKey.get(key);
    if (defType) {
      promoted[key] = coerceForType(trimmed, defType);
    } else {
      custom[key] = trimmed;
    }
  }
  return { promoted, custom };
}

export async function bulkUploadProducts(csv: string): Promise<BulkUploadResult> {
  const parsed = Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw HttpError.badRequest(`CSV parse error on row ${first.row}: ${first.message}`);
  }

  // Load active PRODUCT custom-field defs once. A CSV column whose name
  // exactly matches one of these keys is "promoted" to a top-level
  // `attributes[key]` (where the storefront reads it) instead of being
  // stashed in the customAttributes holding area.
  const productDefs = await prisma.customFieldDef.findMany({
    where: { scope: 'PRODUCT', isActive: true },
    select: { key: true, type: true },
  });
  const defTypeByKey = new Map(productDefs.map((d) => [d.key, d.type as string]));

  // Names of columns the importer didn't recognise as a standard field
  // AND that don't match a custom-field def — these are the ones that
  // land under `attributes.customAttributes`. Columns matching a def are
  // promoted to top level, so they're no longer "unknown".
  const headerFields = parsed.meta.fields ?? [];
  const unknownColumns = headerFields.filter(
    (h) => h && !KNOWN_COLUMNS.has(h) && !defTypeByKey.has(h),
  );

  // Pre-load category slugs once. Mutable map so on-the-fly category /
  // subcategory creation (below) is reused for the rest of the import in
  // the same run instead of re-creating the same slug per-row.
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, parentId: true },
  });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const results: BulkRowResult[] = [];
  let created = 0;
  let updated = 0;
  const skipped = 0;
  let errors = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    // Header row is row 1; data starts at row 2.
    const rowNum = i + 2;

    try {
      const name = row.name?.trim();
      const priceStr = row.price?.trim();
      if (!name || !priceStr) {
        throw new Error('name and price are required');
      }
      const slug = row.slug?.trim() || slugify(name);
      const price = Number(priceStr);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid price "${priceStr}"`);

      const compareStr = row.comparePrice?.trim();
      const comparePrice = compareStr ? Number(compareStr) : null;
      if (comparePrice !== null && (!Number.isFinite(comparePrice) || comparePrice < 0)) {
        throw new Error(`Invalid comparePrice "${compareStr}"`);
      }

      // Category resolution: admins can supply either a slug-formatted
      // column (for explicit control) or a human-readable name column
      // (we slugify it). The slug column wins when both are provided.
      // The display name on a freshly-created category prefers the
      // human name over a humanized slug — so "Sauces & Pastes" stays
      // titled "Sauces & Pastes" instead of "Sauces  Pastes".
      const categoryName = row.category?.trim() || null;
      const categorySlug =
        row.categorySlug?.trim() || (categoryName ? slugify(categoryName) : null);
      const subcategoryName = row.subcategory?.trim() || null;
      const subcategorySlug =
        row.subcategorySlug?.trim() || (subcategoryName ? slugify(subcategoryName) : null);

      if (subcategorySlug && !categorySlug) {
        throw new Error('subcategory requires a category (subcategories must have a parent)');
      }

      let parentCategoryId: string | null = null;
      if (categorySlug) {
        const existingParent = categoryBySlug.get(categorySlug);
        if (existingParent) {
          parentCategoryId = existingParent.id;
        } else {
          const fresh = await prisma.category.create({
            data: {
              slug: categorySlug,
              name: categoryName ?? humanizeSlug(categorySlug),
            },
            select: { id: true, slug: true, parentId: true },
          });
          parentCategoryId = fresh.id;
          categoryBySlug.set(categorySlug, fresh);
        }
      }

      // Final categoryId on the product — leaf wins (subcategory if
      // present, else top-level category). Mirrors how Shopify and
      // WooCommerce treat the deepest assigned term as the canonical
      // category for filtering/breadcrumbs.
      let leafCategoryId: string | null = parentCategoryId;
      if (subcategorySlug) {
        const existingSub = categoryBySlug.get(subcategorySlug);
        if (existingSub) {
          // Reject ambiguous reuse — same slug under a different parent
          // would silently mis-assign products in WordPress imports.
          if (existingSub.parentId !== parentCategoryId) {
            throw new Error(
              `subcategory "${subcategorySlug}" already exists under a different parent — ` +
                `pick a unique slug (e.g. "${categorySlug}-${subcategorySlug}")`,
            );
          }
          leafCategoryId = existingSub.id;
        } else {
          const fresh = await prisma.category.create({
            data: {
              slug: subcategorySlug,
              name: subcategoryName ?? humanizeSlug(subcategorySlug),
              parentId: parentCategoryId,
            },
            select: { id: true, slug: true, parentId: true },
          });
          leafCategoryId = fresh.id;
          categoryBySlug.set(subcategorySlug, fresh);
        }
      }

      const origin = row.origin?.trim().toUpperCase() || null;
      if (origin && origin.length !== 2) {
        throw new Error(`origin must be a 2-letter code (got "${origin}")`);
      }

      const images = row.images
        ? row.images
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const inStock = parseBool(row.inStock, true);
      const brand = row.brand?.trim() || null;
      const shortDescription = row.shortDescription?.trim() || null;
      const description = row.description?.trim() || null;
      const ingredients = row.ingredients?.trim() || null;

      // Split the row's non-standard columns: def-matching ones get
      // promoted to top-level attributes; the rest stay in the
      // customAttributes holding area.
      const { promoted, custom: customAttributes } = splitCustomColumns(row, defTypeByKey);
      const hasPromoted = Object.keys(promoted).length > 0;
      const hasCustom = Object.keys(customAttributes).length > 0;

      const existing = await prisma.product.findUnique({
        where: { slug },
        select: { id: true, attributes: true },
      });

      // Attributes payload differs CREATE vs UPDATE:
      //   - CREATE: write the full default template + promoted fields at
      //     top level + any leftover customAttributes from CSV.
      //   - UPDATE: keep the existing attributes JSON intact (so hand-edited
      //     bundles/features/specs/about survive a CSV refresh) and overlay
      //     the promoted fields (top level) + customAttributes from this row.
      let attributesPayload: Prisma.InputJsonValue | undefined;
      if (existing) {
        if (hasPromoted || hasCustom) {
          const existingAttrs =
            existing.attributes && typeof existing.attributes === 'object' && !Array.isArray(existing.attributes)
              ? (existing.attributes as Record<string, unknown>)
              : {};
          const existingCustom =
            existingAttrs.customAttributes &&
            typeof existingAttrs.customAttributes === 'object' &&
            !Array.isArray(existingAttrs.customAttributes)
              ? (existingAttrs.customAttributes as Record<string, unknown>)
              : {};
          attributesPayload = {
            ...existingAttrs,
            ...promoted,
            ...(hasCustom
              ? { customAttributes: { ...existingCustom, ...customAttributes } }
              : {}),
          } as unknown as Prisma.InputJsonValue;
        }
      } else {
        const defaults = defaultAttributes({ price, comparePrice, name, description, brand, origin });
        attributesPayload = {
          ...defaults,
          ...promoted,
          ...(hasCustom ? { customAttributes } : {}),
        } as unknown as Prisma.InputJsonValue;
      }

      const data = {
        slug,
        name,
        brand,
        shortDescription,
        description,
        ingredients,
        price,
        comparePrice,
        discountPercent: discountPercent(price, comparePrice),
        origin,
        inStock,
        images,
        ...(attributesPayload !== undefined ? { attributes: attributesPayload } : {}),
        categoryId: leafCategoryId,
      };

      if (existing) {
        const updatedRow = await prisma.product.update({
          where: { id: existing.id },
          data,
        });
        await syncProductVariants({
          productId: updatedRow.id,
          attributes: updatedRow.attributes,
          basePrice: updatedRow.price,
          baseComparePrice: updatedRow.comparePrice,
          inStock: updatedRow.inStock,
        });
        updated++;
        results.push({ row: rowNum, slug, status: 'updated' });
      } else {
        const createdRow = await prisma.product.create({
          data: {
            ...data,
            // CREATE always writes attributes (defaults at minimum).
            attributes: (attributesPayload ?? {}) as Prisma.InputJsonValue,
          },
        });
        await syncProductVariants({
          productId: createdRow.id,
          attributes: createdRow.attributes,
          basePrice: createdRow.price,
          baseComparePrice: createdRow.comparePrice,
          inStock: createdRow.inStock,
        });
        created++;
        results.push({ row: rowNum, slug, status: 'created' });
      }
    } catch (err) {
      errors++;
      results.push({
        row: rowNum,
        slug: row.slug?.trim(),
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    total: parsed.data.length,
    created,
    updated,
    skipped,
    errors,
    results,
    unknownColumns,
  };
}

export const BULK_TEMPLATE_CSV = [
  'name,brand,price,comparePrice,category,subcategory,origin,inStock,shortDescription,description,ingredients,images',
  // Recommended form — human-readable category and subcategory names.
  // Slugs are auto-derived; if the names don't exist yet they're
  // auto-created.
  'Tomato Paste,Local Brand,500,700,Groceries,Sauces & Pastes,NG,true,Rich African tomato concentrate,Made from sun-ripened tomatoes,,https://example.com/tomato.jpg',
  // Multiple products under the same auto-created category + subcategory:
  'Honey,Wild Bee,1200,,Groceries,Sweeteners,NG,true,Pure raw honey,,,',
  'Brown Sugar,Refined Co,800,,Groceries,Sweeteners,NG,true,,,,',
  // Top-level category only — no subcategory:
  'Lipstick,Tara,1500,2000,Beauty,,KE,true,Long-lasting matte,,,https://example.com/lipstick.jpg',
  // Out of stock + minimal:
  'Discontinued Item,,500,,Beauty,,GH,false,Currently unavailable,,,',
].join('\n');
