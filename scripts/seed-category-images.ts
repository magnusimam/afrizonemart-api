/**
 * One-shot seed — uploads bundled category cover images into R2 and
 * sets `Category.image` so the mobile chip row + storefront category
 * tiles look populated on first launch.
 *
 * The web has 7 bundled JPGs at
 * `afrizonemart-v2/public/images/categories/`. This script reads them
 * from disk, uploads to R2 (same backend the production /api/uploads
 * endpoint uses), then patches the matching Category rows by slug.
 *
 * Categories without a bundled cover fall through to the chip row's
 * icon fallback on mobile (Ionicon per the `iconFor()` map) — admin
 * can upload covers for the rest via the new picker on /admin/
 * categories (this PR).
 *
 * Idempotent for slugs that map to a bundled image: re-runs upload
 * with a fresh random key + overwrite the DB row. Doesn't touch
 * categories the admin has already given a custom image (we DO
 * overwrite — that's the seed-from-code contract).
 *
 * Usage:
 *   railway run --service api npx tsx scripts/seed-category-images.ts
 *
 * Override the storefront repo path with --repo=<absolute-path>.
 */
import { PrismaClient } from '@prisma/client';
import { R2Storage } from '../src/modules/uploads/storage/r2';
import { LocalDiskStorage } from '../src/modules/uploads/storage/local-disk';
import type { UploadStorage } from '../src/modules/uploads/storage/types';

const STOREFRONT_BASE = (
  process.env.STOREFRONT_BASE_URL ?? 'https://afrizonemart.com'
).replace(/\/+$/, '');

/// Mapping bundled filename → category slug. Skipped slugs fall back
/// to the mobile chip row's icon fallback.
const SLUG_BY_FILENAME: Record<string, string[]> = {
  'art.jpg': ['art-collectibles', 'art'],
  'beauty.jpg': ['beauty', 'beauty-personal-care'],
  'beer.jpg': ['beer-wines-spirit', 'drinks'],
  'for-her.jpg': ['for-her'],
  'for-him.jpg': ['for-him'],
  'groceries.jpg': ['groceries', 'food-beverages', 'groceries-food-beverages'],
  'interior-decor.jpg': ['interior-decor', 'home-essentials'],
};

function getStorage(): UploadStorage {
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET;
  const r2PublicBase = process.env.UPLOADS_PUBLIC_URL_BASE ?? '';

  if (r2AccountId && r2AccessKey && r2SecretKey && r2Bucket && r2PublicBase) {
    console.log(`Using R2 bucket: ${r2Bucket}`);
    return new R2Storage({
      accountId: r2AccountId,
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
      bucket: r2Bucket,
      publicUrlBase: r2PublicBase,
    });
  }

  console.log(`R2 env not set — using local disk (${process.env.UPLOADS_LOCAL_DIR ?? './uploads'}).`);
  return new LocalDiskStorage({
    localDir: process.env.UPLOADS_LOCAL_DIR ?? './uploads',
    publicUrlBase: process.env.UPLOADS_PUBLIC_URL_BASE ?? 'http://localhost:4000/uploads',
  });
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const storage = getStorage();
  console.log(`Source: ${STOREFRONT_BASE}/images/categories/*`);

  let uploaded = 0;
  let patched = 0;
  let skipped = 0;
  try {
    for (const [filename, slugs] of Object.entries(SLUG_BY_FILENAME)) {
      const sourceUrl = `${STOREFRONT_BASE}/images/categories/${filename}`;
      const res = await fetch(sourceUrl);
      if (!res.ok) {
        console.log(`- ${filename}: source returned ${res.status}, skipping`);
        skipped++;
        continue;
      }
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const ext = filename.split('.').pop()!.toLowerCase();
      const key = `categories/${randomHex(12)}.${ext}`;
      const contentType =
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

      const { url } = await storage.put(key, buf, contentType);
      uploaded++;
      console.log(`+ Uploaded ${filename} → ${url}`);

      for (const slug of slugs) {
        const cat = await prisma.category.findUnique({
          where: { slug },
          select: { id: true, name: true },
        });
        if (!cat) {
          console.log(`  - ${slug}: no matching category, skipping`);
          continue;
        }
        await prisma.category.update({
          where: { id: cat.id },
          data: { image: url },
        });
        patched++;
        console.log(`  ~ Patched ${cat.name} (${slug})`);
      }
    }
    console.log('');
    console.log(`Uploaded: ${uploaded}, patched: ${patched} category rows, skipped: ${skipped} bundled files`);
    console.log('');
    console.log('Verify:');
    console.log('  curl https://api.afrizonemart.com/api/categories | jq \'.items[] | {slug, image}\'');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
