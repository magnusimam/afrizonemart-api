/**
 * Phase 10.8 — one-shot backfill.
 *
 * For every shelf that's currently auto-rendering products via its
 * defaultFallback (i.e. has 0 explicit ProductPlacement rows), pin
 * those fallback products onto the shelf as real picks — so when the
 * editor opens /admin/shelves they see the products that customers
 * already see, ready to reorder, remove, or country-scope.
 *
 * Idempotent: skips shelves that already have any explicit picks. Safe
 * to re-run.
 *
 * Usage:
 *   railway run npm run backfill-shelf-picks
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  PLACEMENT_REGISTRY,
  type ShelfFallbackQuery,
} from '../src/modules/placements/registry';

interface FallbackResult {
  ids: string[];
  total: number;
}

async function fetchFallback(
  prisma: PrismaClient,
  fb: ShelfFallbackQuery,
  limit: number,
): Promise<FallbackResult> {
  const where: Prisma.ProductWhereInput = {};
  if (fb.category) {
    // Walk the category tree the same way the public list endpoint
    // does — match the slug + every descendant.
    const all = await prisma.category.findMany({
      select: { id: true, slug: true, parentId: true },
    });
    const root = all.find((c) => c.slug === fb.category);
    if (root) {
      const childrenById = new Map<string | null, typeof all>();
      for (const c of all) {
        const arr = childrenById.get(c.parentId) ?? [];
        arr.push(c);
        childrenById.set(c.parentId, arr);
      }
      const slugs: string[] = [root.slug];
      const stack = [root.id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        const kids = childrenById.get(id) ?? [];
        for (const k of kids) {
          slugs.push(k.slug);
          stack.push(k.id);
        }
      }
      where.category = { slug: { in: slugs } };
    } else {
      where.category = { slug: fb.category };
    }
  }
  if (fb.origin) where.origin = fb.origin.toUpperCase();
  if (fb.onSale === true) where.comparePrice = { not: null };

  // Match the public list ranking — products with images first.
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    fb.sort === 'newest'
      ? { createdAt: 'desc' }
      : fb.sort === 'price-asc'
        ? { price: 'asc' }
        : fb.sort === 'price-desc'
          ? { price: 'desc' }
          : fb.sort === 'rating'
            ? { rating: 'desc' }
            : { createdAt: 'desc' };

  const withImages = await prisma.product.findMany({
    where: { ...where, NOT: { images: { isEmpty: true } } },
    orderBy,
    take: limit,
    select: { id: true },
  });
  if (withImages.length >= limit) {
    return { ids: withImages.map((p) => p.id), total: withImages.length };
  }
  const remaining = limit - withImages.length;
  const withoutImages = await prisma.product.findMany({
    where: { ...where, images: { isEmpty: true } },
    orderBy,
    take: remaining,
    select: { id: true },
  });
  const ids = [...withImages, ...withoutImages].map((p) => p.id);
  return { ids, total: ids.length };
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');

  try {
    const candidates = PLACEMENT_REGISTRY.filter((d) => d.defaultFallback);
    console.log(
      `Inspecting ${candidates.length} shelf key${candidates.length === 1 ? '' : 's'} with a registered fallback…\n`,
    );

    const summary: Array<{
      key: string;
      action: 'skipped (has picks)' | 'skipped (fallback empty)' | 'filled';
      count: number;
    }> = [];

    for (const def of candidates) {
      const existing = await prisma.productPlacement.count({
        where: { placement: def.key },
      });
      if (existing > 0) {
        summary.push({ key: def.key, action: 'skipped (has picks)', count: existing });
        continue;
      }
      const cap = (def.defaultRows ?? 1) * (def.defaultCols ?? 6);
      const fb = def.defaultFallback!;
      const { ids } = await fetchFallback(prisma, fb, cap);
      if (ids.length === 0) {
        summary.push({ key: def.key, action: 'skipped (fallback empty)', count: 0 });
        continue;
      }
      if (!dryRun) {
        await prisma.productPlacement.createMany({
          data: ids.map((productId, idx) => ({
            productId,
            placement: def.key,
            sortOrder: (idx + 1) * 10,
            countries: [],
          })),
        });
      }
      summary.push({ key: def.key, action: 'filled', count: ids.length });
    }

    console.log('Result:');
    for (const r of summary) {
      const icon = r.action === 'filled' ? '✓' : r.action.startsWith('skipped (has') ? '·' : '∅';
      console.log(`  ${icon} ${r.key.padEnd(28)} ${r.action.padEnd(28)} (${r.count})`);
    }
    if (dryRun) console.log('\n(dry-run — no rows written. Re-run without --dry-run to apply.)');
    else console.log('\nDone. Open /admin/shelves to edit each shelf.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('backfill-shelf-picks failed:', err);
  process.exit(1);
});
