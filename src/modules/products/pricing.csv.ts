import Papa from 'papaparse';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { applyPriceChange } from './pricing.service';

/**
 * Bulk-price CSV import (PR 3 of the price-management workstream).
 *
 * Distinct from the existing `admin.bulk.ts` product CSV — that one
 * upserts full product records; this one only touches price fields
 * on existing products. Looking it up by slug (the stable identifier
 * customers see in URLs).
 *
 * Each row that actually changes price writes through
 * `applyPriceChange()` so every CSV-driven change lands in the
 * audit log with source: 'CSV'.
 *
 * Recognised columns (case-insensitive header match):
 *   slug          — required; the identifier we look up by
 *   price         — required; new price in NGN whole units
 *   comparePrice  — optional; strike-through anchor. Empty string
 *                   or 0 clears the field.
 *   reason        — optional; free-form note that lands on the
 *                   audit row (e.g. "Q3 supplier price hike").
 *
 * Unknown columns are ignored (NOT stashed as attributes — that
 * pattern from admin.bulk.ts would be surprising here).
 */

const TEMPLATE_COLUMNS = ['slug', 'price', 'comparePrice', 'reason'];

export interface PriceBulkRowResult {
  row: number;
  slug?: string;
  status: 'updated' | 'unchanged' | 'not-found' | 'error';
  message?: string;
  oldPrice?: number;
  newPrice?: number;
  oldComparePrice?: number | null;
  newComparePrice?: number | null;
}

export interface PriceBulkUploadResult {
  total: number;
  updated: number;
  unchanged: number;
  notFound: number;
  errors: number;
  results: PriceBulkRowResult[];
}

interface RawRow {
  [k: string]: string | undefined;
}

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const HEADER_ALIASES: Record<string, string> = {
  slug: 'slug',
  productslug: 'slug',
  sku: 'slug', // common in supplier sheets — treated as slug
  price: 'price',
  newprice: 'price',
  compareprice: 'comparePrice',
  compareatprice: 'comparePrice',
  was: 'comparePrice',
  reason: 'reason',
  note: 'reason',
};

function parsePriceCell(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Strip commas and currency markers ("₦5,000", "5,000.00").
  const cleaned = trimmed.replace(/[₦$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`"${value}" is not a valid price`);
  }
  return Math.round(n);
}

export async function bulkUploadPrices(
  csv: string,
  actorId: string | null,
): Promise<PriceBulkUploadResult> {
  if (!csv.trim()) {
    throw HttpError.badRequest('CSV body is empty.');
  }
  const parsed = Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => HEADER_ALIASES[normaliseHeader(h)] ?? normaliseHeader(h),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw HttpError.badRequest(`CSV parse error on row ${first.row}: ${first.message}`);
  }
  const rows = parsed.data;

  const results: PriceBulkRowResult[] = [];
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    // Skip rows that are entirely empty (papaparse 'greedy' usually
    // catches these, but defensive).
    if (Object.values(raw).every((v) => !v || v.trim() === '')) continue;

    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const slug = raw.slug?.trim();
    if (!slug) {
      errors++;
      results.push({
        row: rowNumber,
        status: 'error',
        message: 'Missing slug',
      });
      continue;
    }

    let price: number | null | undefined;
    let comparePrice: number | null | undefined;
    try {
      price = parsePriceCell(raw.price);
      comparePrice = parsePriceCell(raw.comparePrice);
    } catch (e) {
      errors++;
      results.push({
        row: rowNumber,
        slug,
        status: 'error',
        message: e instanceof Error ? e.message : 'Invalid price value',
      });
      continue;
    }
    if (price === undefined || price === null) {
      errors++;
      results.push({
        row: rowNumber,
        slug,
        status: 'error',
        message: 'price column is required',
      });
      continue;
    }

    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, price: true, comparePrice: true },
    });
    if (!product) {
      notFound++;
      results.push({
        row: rowNumber,
        slug,
        status: 'not-found',
        message: `No product with slug "${slug}"`,
      });
      continue;
    }

    try {
      const r = await applyPriceChange(
        product.id,
        {
          price,
          ...(comparePrice !== undefined && { comparePrice }),
        },
        {
          actorId,
          source: 'CSV',
          reason: raw.reason?.trim() || null,
        },
      );
      if (r.noop) {
        unchanged++;
        results.push({
          row: rowNumber,
          slug,
          status: 'unchanged',
          oldPrice: r.oldPrice,
          newPrice: r.newPrice,
          oldComparePrice: r.oldComparePrice,
          newComparePrice: r.newComparePrice,
        });
      } else {
        updated++;
        results.push({
          row: rowNumber,
          slug,
          status: 'updated',
          oldPrice: r.oldPrice,
          newPrice: r.newPrice,
          oldComparePrice: r.oldComparePrice,
          newComparePrice: r.newComparePrice,
        });
      }
    } catch (e) {
      errors++;
      results.push({
        row: rowNumber,
        slug,
        status: 'error',
        message: e instanceof Error ? e.message : 'Update failed',
      });
    }
  }

  return {
    total: results.length,
    updated,
    unchanged,
    notFound,
    errors,
    results,
  };
}

export const PRICE_BULK_TEMPLATE_CSV = [
  TEMPLATE_COLUMNS.join(','),
  // Existing slugs only — this CSV updates prices on products that
  // already exist. Use the main product import for creating new
  // rows.
  'smoov-chapman-50cl-pet,2500,3000,Supplier July price sheet',
  'tomato-paste,650,,Trim margin to 8%',
  // Pass blank comparePrice to clear the strike-through anchor:
  'honey,1500,,',
].join('\n');
