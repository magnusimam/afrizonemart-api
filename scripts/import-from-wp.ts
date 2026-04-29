/**
 * One-time WordPress → Afrizonemart 2.0 product import.
 *
 * Reads a WooCommerce CSV export + the matching uploads ZIP, normalises
 * every row, uploads each product's image to Cloudflare R2, then writes
 * Products + auto-created Categories into Postgres.
 *
 * Usage (from afrizonemart-api/):
 *
 *   # Dry run (no writes, no uploads — just logs the plan)
 *   npx tsx scripts/import-from-wp.ts \
 *     --csv "C:/Users/USER/Downloads/products_export_temp.csv" \
 *     --zip "C:/Users/USER/Downloads/images_export_temp.zip" \
 *     --dry-run
 *
 *   # Real run
 *   npx tsx scripts/import-from-wp.ts \
 *     --csv "C:/Users/USER/Downloads/products_export_temp.csv" \
 *     --zip "C:/Users/USER/Downloads/images_export_temp.zip"
 *
 *   # Update existing products (matched by slug) instead of skipping them
 *   npx tsx scripts/import-from-wp.ts ... --update-existing
 *
 * Env vars required: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL_BASE.
 *
 * Idempotent: re-running with the same CSV is safe; existing slugs are
 * skipped (or updated with --update-existing).
 */
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';

// ---------- args ----------
const args = process.argv.slice(2);
const argVal = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const v = args[idx + 1];
  if (!v || v.startsWith('--')) return undefined;
  return v;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const CSV_PATH = argVal('csv');
const ZIP_PATH = argVal('zip');
const DRY_RUN = flag('dry-run');
const UPDATE_EXISTING = flag('update-existing');

if (!CSV_PATH || !ZIP_PATH) {
  console.error('Usage: --csv <path> --zip <path> [--dry-run] [--update-existing]');
  process.exit(1);
}

// ---------- config ----------
const CATEGORIES_TO_SKIP = new Set([
  'Car Lights & Lighting Accessories',
]);

/**
 * WP category name → our root category slug. Auto-creates a slug if not in
 * this map. Supports the existing 4 (groceries / beauty / books /
 * interior-decor) and creates new ones for the rest.
 */
const ROOT_CATEGORY_BY_WP_NAME: Record<string, { slug: string; name: string }> = {
  // Groceries family
  'Groceries, Food & Beverages': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Grains, Pasta & Noodles': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Cooking Oil & Ingredients': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Spices & Seasoning': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Swallow': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Livestock, Fish & Poultry': { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  'Agricultural Products': { slug: 'agriculture', name: 'Agricultural Products' },

  // Beauty & care family
  'Beauty & Personal Care': { slug: 'beauty', name: 'Beauty & Personal Care' },
  'Hair Care': { slug: 'beauty', name: 'Beauty & Personal Care' },
  'Personal Care': { slug: 'beauty', name: 'Beauty & Personal Care' },
  'Soaps & Detergents': { slug: 'home-supplies', name: 'Home Supplies' },
  'Oral Care': { slug: 'beauty', name: 'Beauty & Personal Care' },

  // Health
  'Vitamins & Dietary Supplements': { slug: 'health', name: 'Health & Wellness' },
  'Health And Household': { slug: 'health', name: 'Health & Wellness' },

  // Home
  'Household Supplies': { slug: 'home-supplies', name: 'Home Supplies' },
};

const DEFAULT_ORIGIN = 'NG';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL_BASE = (process.env.R2_PUBLIC_URL_BASE ?? '').replace(/\/$/, '');

if (
  !DRY_RUN &&
  (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL_BASE)
) {
  console.error('Missing R2 env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL_BASE');
  process.exit(1);
}

const prisma = new PrismaClient();
const s3 = DRY_RUN
  ? null
  : new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    });

// ---------- helpers ----------
const decodeHtml = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const stripHtml = (s: string): string =>
  decodeHtml(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const contentTypeFor = (filename: string): string => {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.avif': return 'image/avif';
    default: return 'application/octet-stream';
  }
};

interface WpCategory { name: string; slug: string }
interface WpImage { src: string; name?: string; alt?: string }
interface CsvRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: string;
  description: string;
  short_description: string;
  categories: string;
  images: string;
  status: string;
}

interface PlannedProduct {
  csvId: string;
  slug: string;
  name: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  price: number;
  comparePrice: number | null;
  origin: string;
  inStock: boolean;
  categorySlug: string | null;
  imageZipPath: string | null;
  imageR2Key: string;
  reason?: string;        // when skipped
}

// ---------- main ----------
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' WordPress → Afrizonemart 2.0 product import');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` CSV:        ${CSV_PATH}`);
  console.log(` ZIP:        ${ZIP_PATH}`);
  console.log(` Mode:       ${DRY_RUN ? '🟡 DRY RUN — no writes, no uploads' : '🔴 LIVE — will write to DB and upload to R2'}`);
  console.log(` On clash:   ${UPDATE_EXISTING ? 'UPDATE existing slug' : 'SKIP existing slug'}`);
  console.log(` DB target:  ${(process.env.DATABASE_URL ?? 'unset').replace(/:[^@]+@/, ':***@')}`);
  console.log('───────────────────────────────────────────────────────────\n');

  // Parse CSV
  const csv = readFileSync(CSV_PATH!, 'utf8');
  const { data, errors } = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) {
    console.warn(`⚠ CSV had ${errors.length} parser warnings (showing first 3):`);
    errors.slice(0, 3).forEach((e) => console.warn('  ·', e.message));
  }
  console.log(`📄 Parsed ${data.length} rows from CSV\n`);

  // Open ZIP — adm-zip reads the central directory only, so this is fast.
  const zip = new AdmZip(ZIP_PATH!);
  const zipEntries = zip.getEntries();
  console.log(`📦 ZIP contains ${zipEntries.length} entries\n`);
  // Index by full path for O(1) lookup
  const zipByPath = new Map(zipEntries.map((e) => [e.entryName, e]));

  // ---------- Pass 1: plan ----------
  const planned: PlannedProduct[] = [];
  const skipped: PlannedProduct[] = [];
  const newCategoriesNeeded = new Map<string, string>(); // slug → display name

  for (const row of data) {
    const planRow = (reason?: string): PlannedProduct => ({
      csvId: row.id,
      slug: row.slug || slugify(row.name ?? ''),
      name: row.name,
      brand: null,
      shortDescription: null,
      description: null,
      price: 0,
      comparePrice: null,
      origin: DEFAULT_ORIGIN,
      inStock: true,
      categorySlug: null,
      imageZipPath: null,
      imageR2Key: '',
      reason,
    });

    if (!row.name?.trim()) {
      skipped.push(planRow('No name'));
      continue;
    }
    if (row.status !== 'publish') {
      skipped.push(planRow(`Status is "${row.status}", not "publish"`));
      continue;
    }
    const priceRaw = row.regular_price || row.price;
    const price = Number(priceRaw);
    if (!priceRaw || !Number.isFinite(price) || price <= 0) {
      skipped.push(planRow('Missing or invalid price'));
      continue;
    }

    // Categories
    let categories: WpCategory[] = [];
    try {
      categories = JSON.parse(row.categories || '[]') as WpCategory[];
    } catch {
      categories = [];
    }
    const catNames = categories.map((c) => decodeHtml(c.name));
    if (catNames.some((n) => CATEGORIES_TO_SKIP.has(n))) {
      skipped.push(planRow(`In skip-list category: ${catNames.find((n) => CATEGORIES_TO_SKIP.has(n))}`));
      continue;
    }

    // Pick the first WP category we recognise; fall back to default 'groceries'
    let categoryRoot = ROOT_CATEGORY_BY_WP_NAME['Groceries, Food & Beverages'];
    for (const n of catNames) {
      if (ROOT_CATEGORY_BY_WP_NAME[n]) {
        categoryRoot = ROOT_CATEGORY_BY_WP_NAME[n];
        break;
      }
    }
    if (categoryRoot.slug && !['groceries', 'beauty', 'books', 'interior-decor'].includes(categoryRoot.slug)) {
      newCategoriesNeeded.set(categoryRoot.slug, categoryRoot.name);
    }

    // Image
    let images: WpImage[] = [];
    try {
      images = JSON.parse(row.images || '[]') as WpImage[];
    } catch {
      images = [];
    }
    const firstImage = images[0];
    let imageZipPath: string | null = null;
    if (firstImage?.src) {
      // Strip the WP host prefix to get the path under uploads/
      const after = firstImage.src.replace(
        /^https?:\/\/(?:www\.)?afrizonemart\.com\/wp-content\/uploads\//i,
        '',
      );
      const zipPath = `home/afrizonemart/public_html/wp-content/uploads/${after}`;
      if (zipByPath.has(zipPath)) {
        imageZipPath = zipPath;
      }
    }

    if (!imageZipPath) {
      skipped.push(planRow('Image not found in ZIP'));
      continue;
    }

    // Slug clash handling — name-only lookup against our planned set + DB happens at write time
    const slug = row.slug || slugify(row.name);

    const description = row.description ? decodeHtml(row.description).trim() : null;
    const shortDescriptionRaw = row.short_description?.trim()
      ? decodeHtml(row.short_description.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
      : description
        ? stripHtml(description).slice(0, 160)
        : null;

    // Sale pricing
    const sale = Number(row.sale_price);
    const onSale = Number.isFinite(sale) && sale > 0 && sale < price;

    planned.push({
      csvId: row.id,
      slug,
      name: row.name.trim(),
      brand: null,
      shortDescription: shortDescriptionRaw,
      description,
      price: onSale ? sale : price,
      comparePrice: onSale ? price : null,
      origin: DEFAULT_ORIGIN,
      inStock: true,
      categorySlug: categoryRoot.slug,
      imageZipPath,
      imageR2Key: `products/${slug}${extname(basename(imageZipPath))}`,
    });
  }

  console.log(`✅ Planned: ${planned.length}`);
  console.log(`⏭  Skipped: ${skipped.length}`);
  if (newCategoriesNeeded.size > 0) {
    console.log(`📁 New categories that will be auto-created: ${newCategoriesNeeded.size}`);
    for (const [slug, name] of newCategoriesNeeded) {
      console.log(`   · ${slug} (${name})`);
    }
  }
  if (skipped.length > 0) {
    console.log('\n--- Skipped breakdown ---');
    const reasonCounts = new Map<string, number>();
    for (const s of skipped) {
      const r = s.reason ?? '?';
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
    for (const [r, c] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${c.toString().padStart(3)} × ${r}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n--- First 5 products (preview) ---');
    for (const p of planned.slice(0, 5)) {
      console.log(`  · ${p.slug}`);
      console.log(`     name:     ${p.name}`);
      console.log(`     category: ${p.categorySlug}`);
      console.log(`     price:    ₦${p.price.toLocaleString()}`);
      console.log(`     image:    ${p.imageZipPath} → ${p.imageR2Key}`);
    }
    console.log('\n🟡 DRY RUN finished. Re-run without --dry-run to commit.');
    await prisma.$disconnect();
    return;
  }

  // ---------- Pass 2: ensure categories ----------
  console.log('\n📁 Ensuring categories…');
  const baseCategories = [
    { slug: 'groceries', name: 'Groceries, Food & Beverages' },
    { slug: 'beauty', name: 'Beauty & Personal Care' },
    { slug: 'books', name: 'Books' },
    { slug: 'interior-decor', name: 'Interior Decor' },
  ];
  for (const c of baseCategories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }
  for (const [slug, name] of newCategoriesNeeded) {
    const created = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    console.log(`   ✓ ${created.slug} (${created.name})`);
  }

  // Cache category id by slug
  const catBySlug = new Map<string, string>();
  for (const c of await prisma.category.findMany()) catBySlug.set(c.slug, c.id);

  // ---------- Pass 3: upload images + write products ----------
  console.log('\n🚚 Uploading images + writing products…');
  let createdCount = 0;
  let updatedCount = 0;
  let skippedClashCount = 0;
  let errorCount = 0;
  const errored: Array<{ slug: string; reason: string }> = [];

  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const tag = `[${(i + 1).toString().padStart(3)}/${planned.length}] ${p.slug}`;
    try {
      const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
      if (existing && !UPDATE_EXISTING) {
        skippedClashCount++;
        console.log(`${tag} ↪ skip — slug exists`);
        continue;
      }

      // Upload image to R2
      const entry = zipByPath.get(p.imageZipPath!);
      if (!entry) throw new Error('image vanished from ZIP after planning');
      const buf = entry.getData();
      await s3!.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET!,
          Key: p.imageR2Key,
          Body: buf,
          ContentType: contentTypeFor(p.imageR2Key),
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      const imageUrl = `${R2_PUBLIC_URL_BASE}/${p.imageR2Key}`;

      const data = {
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        shortDescription: p.shortDescription,
        description: p.description,
        price: p.price,
        comparePrice: p.comparePrice,
        discountPercent: p.comparePrice
          ? Math.round(((p.comparePrice - p.price) / p.comparePrice) * 100)
          : null,
        origin: p.origin,
        inStock: p.inStock,
        rating: 0,
        reviewCount: 0,
        images: [imageUrl],
        attributes: {},
        categoryId: p.categorySlug ? catBySlug.get(p.categorySlug) ?? null : null,
      };

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        updatedCount++;
        console.log(`${tag} ↻ updated`);
      } else {
        await prisma.product.create({ data });
        createdCount++;
        console.log(`${tag} ✓ created`);
      }
    } catch (err) {
      errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      errored.push({ slug: p.slug, reason: message });
      console.log(`${tag} ✗ ${message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Final report');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` ✓ Created:        ${createdCount}`);
  console.log(` ↻ Updated:        ${updatedCount}`);
  console.log(` ↪ Skipped (clash): ${skippedClashCount}`);
  console.log(` ⏭ Skipped (plan): ${skipped.length}`);
  console.log(` ✗ Errored:        ${errorCount}`);
  if (errored.length > 0) {
    console.log('\n Errored slugs:');
    for (const e of errored) console.log(`   · ${e.slug} — ${e.reason}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
