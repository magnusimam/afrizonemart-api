/**
 * Retroactive subcategory migration.
 *
 * After a CSV import that ran before the API recognised the
 * `subcategory` column, the values landed in
 * `attributes.customAttributes.subcategory` instead of triggering
 * subcategory auto-creation. This script:
 *
 *   1. Finds every product with a stashed `subcategory` /
 *      `subcategorySlug` value in customAttributes.
 *   2. Groups by (currentParentCategorySlug, subcategorySlug).
 *   3. For each group: ensures a Category row exists with that slug
 *      under that parent. Reuses an existing one if present and
 *      under the same parent; aborts on cross-parent collisions.
 *   4. Moves all products in the group to the new subcategory.
 *   5. Cleans the stashed value off the products' attributes
 *      (so subsequent CSV refreshes don't loop).
 *
 * Idempotent — running twice is a no-op.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate-stashed-subcategories.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/migrate-stashed-subcategories.ts --dry
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry');

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

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  categoryId: string | null;
  category: { id: string; slug: string; parentId: string | null } | null;
  attributes: unknown;
}

interface PendingMove {
  productId: string;
  productSlug: string;
  parentCategoryId: string;
  parentSlug: string;
  subcategorySlug: string;
  subcategoryName: string;
  /// Key pointing at the customAttributes entry to clean up.
  attrsClean: { key: string };
}

async function main() {
  console.log(`[migrate] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`[migrate] Database: ${(process.env.DATABASE_URL ?? '').replace(/:[^:@]+@/, ':***@')}`);

  const products = (await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      categoryId: true,
      category: { select: { id: true, slug: true, parentId: true } },
      attributes: true,
    },
  })) as ProductRow[];

  const moves: PendingMove[] = [];
  let withoutCategory = 0;
  let alreadyClean = 0;

  for (const pr of products) {
    const a = pr.attributes;
    if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
    const ca = (a as Record<string, unknown>).customAttributes;
    if (!ca || typeof ca !== 'object' || Array.isArray(ca)) continue;
    const customAttrs = ca as Record<string, unknown>;

    // Look for the stashed subcategory under any reasonable casing.
    const candidateKeys = ['subcategory', 'subcategorySlug', 'Subcategory', 'SubCategory'];
    const foundKey = candidateKeys.find((k) => typeof customAttrs[k] === 'string' && customAttrs[k]);
    if (!foundKey) {
      alreadyClean++;
      continue;
    }
    const rawSubValue = String(customAttrs[foundKey]).trim();
    if (!rawSubValue) {
      alreadyClean++;
      continue;
    }

    if (!pr.category) {
      withoutCategory++;
      console.warn(
        `[migrate] SKIP product "${pr.slug}" — has subcategory "${rawSubValue}" but no parent category. Assign it manually first.`,
      );
      continue;
    }
    // If the product's current category is itself a child (parentId set),
    // we'd be nesting too deep. Skip — the schema enforces 2-level max.
    if (pr.category.parentId) {
      console.warn(
        `[migrate] SKIP product "${pr.slug}" — its current category "${pr.category.slug}" is already a subcategory. Cannot nest deeper.`,
      );
      continue;
    }

    const subcategorySlug = slugify(rawSubValue);
    if (!subcategorySlug) continue;
    const subcategoryName = humanizeSlug(rawSubValue);

    moves.push({
      productId: pr.id,
      productSlug: pr.slug,
      parentCategoryId: pr.category.id,
      parentSlug: pr.category.slug,
      subcategorySlug,
      subcategoryName,
      attrsClean: { key: foundKey },
    });
  }

  console.log(`[migrate] Products scanned: ${products.length}`);
  console.log(`[migrate] Products with stashed subcategory: ${moves.length}`);
  console.log(`[migrate] Products with no parent category (skipped): ${withoutCategory}`);
  console.log(`[migrate] Products already clean: ${alreadyClean}`);

  // Group unique (parentSlug, subcategorySlug) pairs.
  const subcategoryGroups = new Map<
    string,
    {
      parentCategoryId: string;
      parentSlug: string;
      subcategorySlug: string;
      subcategoryName: string;
      productIds: string[];
    }
  >();
  for (const m of moves) {
    const key = `${m.parentSlug}|${m.subcategorySlug}`;
    const existing = subcategoryGroups.get(key);
    if (existing) {
      existing.productIds.push(m.productId);
    } else {
      subcategoryGroups.set(key, {
        parentCategoryId: m.parentCategoryId,
        parentSlug: m.parentSlug,
        subcategorySlug: m.subcategorySlug,
        subcategoryName: m.subcategoryName,
        productIds: [m.productId],
      });
    }
  }

  console.log(`[migrate] Unique subcategories to ensure: ${subcategoryGroups.size}`);
  console.log('');

  // Build a fast slug → existing-category map for collision checks.
  const allCategories = await prisma.category.findMany({
    select: { id: true, slug: true, parentId: true, name: true },
  });
  const categoryBySlug = new Map(allCategories.map((c) => [c.slug, c]));

  let createdCount = 0;
  let reusedCount = 0;
  let skippedCount = 0;
  let movedCount = 0;
  let crossParentSkips = 0;

  for (const [, group] of subcategoryGroups) {
    let subcategoryId: string | null = null;

    const existingSub = categoryBySlug.get(group.subcategorySlug);
    if (existingSub) {
      if (existingSub.parentId === group.parentCategoryId) {
        subcategoryId = existingSub.id;
        reusedCount++;
        console.log(
          `[migrate] REUSE  ${group.parentSlug}/${group.subcategorySlug} (${group.productIds.length} products)`,
        );
      } else {
        // Slug clash with a different parent — refuse to silently
        // mis-assign. Admin must rename one of the conflicting slugs.
        crossParentSkips++;
        console.warn(
          `[migrate] CONFLICT "${group.subcategorySlug}" already exists under a different parent. Skipping ${group.productIds.length} products.`,
        );
        skippedCount += group.productIds.length;
        continue;
      }
    } else {
      console.log(
        `[migrate] CREATE ${group.parentSlug}/${group.subcategorySlug} (${group.productIds.length} products)`,
      );
      createdCount++;
      if (!DRY_RUN) {
        const created = await prisma.category.create({
          data: {
            slug: group.subcategorySlug,
            name: group.subcategoryName,
            parentId: group.parentCategoryId,
          },
          select: { id: true, slug: true, parentId: true, name: true },
        });
        subcategoryId = created.id;
        categoryBySlug.set(created.slug, created);
      }
    }

    if (DRY_RUN) {
      movedCount += group.productIds.length;
      continue;
    }

    if (!subcategoryId) {
      // Should never happen outside dry-run.
      continue;
    }

    // Move all products in this group + clean their stashed attribute.
    // One transaction per group keeps things efficient and atomic.
    const productsToUpdate = await prisma.product.findMany({
      where: { id: { in: group.productIds } },
      select: { id: true, attributes: true },
    });

    await prisma.$transaction(
      productsToUpdate.map((p) => {
        const a = p.attributes;
        let cleanedAttributes: unknown = a;
        if (a && typeof a === 'object' && !Array.isArray(a)) {
          const obj = { ...(a as Record<string, unknown>) };
          const ca = obj.customAttributes;
          if (ca && typeof ca === 'object' && !Array.isArray(ca)) {
            const newCa = { ...(ca as Record<string, unknown>) };
            for (const k of [
              'subcategory',
              'subcategorySlug',
              'Subcategory',
              'SubCategory',
            ]) {
              delete newCa[k];
            }
            // If customAttributes is now empty, drop the wrapper too.
            if (Object.keys(newCa).length === 0) {
              delete obj.customAttributes;
            } else {
              obj.customAttributes = newCa;
            }
            cleanedAttributes = obj;
          }
        }
        return prisma.product.update({
          where: { id: p.id },
          data: {
            categoryId: subcategoryId!,
            attributes: cleanedAttributes as object,
          },
        });
      }),
    );
    movedCount += productsToUpdate.length;
  }

  console.log('');
  console.log(`[migrate] Subcategories created: ${createdCount}`);
  console.log(`[migrate] Subcategories reused:  ${reusedCount}`);
  console.log(`[migrate] Cross-parent conflicts: ${crossParentSkips}`);
  console.log(`[migrate] Products reassigned:   ${movedCount}`);
  console.log(`[migrate] Products skipped (conflict): ${skippedCount}`);
  console.log(`[migrate] Done${DRY_RUN ? ' (DRY RUN — no writes)' : ''}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
