import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';

/**
 * Idempotent startup task — guarantees the core category list exists
 * in the DB so the storefront's "All Categories" dropdown always has
 * something to render. Only inserts categories whose slug isn't
 * already present; never deletes or renames.
 *
 * Add new categories here; they'll appear in production on the next
 * API deploy (and be editable through /admin/categories afterwards).
 */
const CORE_CATEGORIES: Array<{ slug: string; name: string }> = [
  { slug: 'agriculture', name: 'Agricultural Products' },
  { slug: 'art-collectibles', name: 'Art & Collectibles' },
  { slug: 'automobile', name: 'Automobile' },
  { slug: 'beauty', name: 'Beauty & Personal Care' },
  { slug: 'beer-wines-spirit', name: 'Beer, Wines & Spirit' },
  { slug: 'books', name: 'Books' },
  { slug: 'fashion', name: 'Fashion' },
  { slug: 'for-her', name: 'For Her' },
  { slug: 'for-him', name: 'For Him' },
  { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  { slug: 'health', name: 'Health & Wellness' },
  { slug: 'home-essentials', name: 'Home Essentials' },
  { slug: 'home-supplies', name: 'Home Supplies' },
  { slug: 'interior-decor', name: 'Interior Decor' },
];

export async function ensureCoreCategories(): Promise<void> {
  try {
    const existing = await prisma.category.findMany({ select: { slug: true } });
    const present = new Set(existing.map((c) => c.slug));
    const missing = CORE_CATEGORIES.filter((c) => !present.has(c.slug));
    if (missing.length === 0) return;

    await prisma.category.createMany({
      data: missing,
      skipDuplicates: true,
    });
    logger.info('ensure-categories: inserted missing categories', {
      slugs: missing.map((c) => c.slug),
    });
  } catch (err) {
    // Non-fatal — the app should still boot even if this fails. The
    // admin can add categories manually.
    logger.warn('ensure-categories: failed', {
      err: (err as Error).message,
    });
  }
}
