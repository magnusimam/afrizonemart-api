import Papa from 'papaparse';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

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
}

interface CsvRow {
  slug?: string;
  name?: string;
  brand?: string;
  shortDescription?: string;
  description?: string;
  ingredients?: string;
  price?: string;
  comparePrice?: string;
  origin?: string;
  inStock?: string;
  images?: string;
  categorySlug?: string;
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n']);

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

export async function bulkUploadProducts(csv: string): Promise<BulkUploadResult> {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw HttpError.badRequest(`CSV parse error on row ${first.row}: ${first.message}`);
  }

  // Pre-load category slugs once.
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const results: BulkRowResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    // Header row is row 1; data starts at row 2.
    const rowNum = i + 2;

    try {
      const slug = row.slug?.trim();
      const name = row.name?.trim();
      const priceStr = row.price?.trim();
      if (!slug || !name || !priceStr) {
        throw new Error('slug, name, and price are required');
      }
      const price = Number(priceStr);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid price "${priceStr}"`);

      const compareStr = row.comparePrice?.trim();
      const comparePrice = compareStr ? Number(compareStr) : null;
      if (comparePrice !== null && (!Number.isFinite(comparePrice) || comparePrice < 0)) {
        throw new Error(`Invalid comparePrice "${compareStr}"`);
      }

      const categorySlug = row.categorySlug?.trim() || null;
      const categoryId = categorySlug ? categoryIdBySlug.get(categorySlug) ?? null : null;
      if (categorySlug && !categoryId) {
        throw new Error(`Unknown categorySlug "${categorySlug}"`);
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

      const attributes = defaultAttributes({
        price,
        comparePrice,
        name,
        description,
        brand,
        origin,
      });

      const existing = await prisma.product.findUnique({ where: { slug }, select: { id: true } });

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
        // Only set attributes on CREATE — preserve hand-edited attributes
        // on existing products so a CSV refresh of pricing/copy doesn't
        // wipe carefully tuned bundles/features/specs.
        ...(existing ? {} : { attributes: attributes as unknown as Prisma.InputJsonValue }),
        categoryId,
      };

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        updated++;
        results.push({ row: rowNum, slug, status: 'updated' });
      } else {
        await prisma.product.create({
          data: {
            ...data,
            attributes: attributes as unknown as Prisma.InputJsonValue,
          },
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
  };
}

export const BULK_TEMPLATE_CSV = [
  'slug,name,brand,price,comparePrice,categorySlug,origin,inStock,shortDescription,description,ingredients,images',
  'example-product,Example Product,Example Brand,1500,2000,groceries,NG,true,A short tagline,A longer description goes here,Sucrose|Coconut Oil,https://example.com/img1.jpg|https://example.com/img2.jpg',
  'example-out-of-stock,Out of Stock Example,,500,,beauty,GH,false,Currently unavailable,,,',
].join('\n');
