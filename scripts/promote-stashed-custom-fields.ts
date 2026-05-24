/**
 * Retroactive custom-field promotion.
 *
 * Before the bulk importer learned about CustomFieldDefs, any CSV
 * column that wasn't a standard product field landed in
 * `attributes.customAttributes.<col>` — even when a matching
 * CustomFieldDef existed. The storefront PDP reads custom-field
 * values from TOP-LEVEL `attributes[def.key]`, so those stashed
 * values never rendered.
 *
 * This script promotes stashed values to where the PDP reads them:
 *
 *   1. Finds every product with an `attributes.customAttributes`
 *      object.
 *   2. For each stashed key:
 *        a. exact match to an active PRODUCT def key → promote.
 *        b. else camelCase→snake_case (publicationYear →
 *           publication_year) and re-check → promote under the def key.
 *      Promoted values are type-coerced per the def (NUMBER → number,
 *      BOOLEAN → bool).
 *   3. Promotion is non-destructive at the top level: an existing
 *      top-level value is NOT overwritten (hand edits win).
 *   4. Removes promoted keys from customAttributes; leaves unmatched
 *      keys (e.g. `format`, for which no def exists) untouched.
 *   5. Books-only author recovery: for products under the "books"
 *      category tree, if `attributes.author` is still empty and the
 *      product has a non-empty `brand`, set author = brand. (The book
 *      CSVs used the `brand` column for the author name.)
 *
 * Idempotent — running twice is a no-op. Dry by default; pass
 * `--apply` to write.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/promote-stashed-custom-fields.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/promote-stashed-custom-fields.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

function camelToSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n']);

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

type Attrs = Record<string, unknown>;

async function main() {
  console.log(`\n=== Promote stashed custom fields ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===\n`);

  // Active PRODUCT defs: key → type.
  const defs = await prisma.customFieldDef.findMany({
    where: { scope: 'PRODUCT', isActive: true },
    select: { key: true, type: true },
  });
  const defTypeByKey = new Map(defs.map((d) => [d.key, d.type as string]));
  console.log('Active PRODUCT defs:', [...defTypeByKey.keys()].join(', ') || '(none)');
  if (defTypeByKey.size === 0) {
    console.log('No defs — nothing to promote. Exiting.');
    return;
  }

  // Books category subtree (for author recovery). Collect the "books"
  // root + all descendant category ids.
  const booksRoot = await prisma.category.findFirst({
    where: { slug: 'books' },
    select: { id: true },
  });
  const bookCategoryIds = new Set<string>();
  if (booksRoot) {
    bookCategoryIds.add(booksRoot.id);
    const children = await prisma.category.findMany({
      where: { parentId: booksRoot.id },
      select: { id: true },
    });
    for (const c of children) bookCategoryIds.add(c.id);
    // One more level down in case of deep nesting.
    const grandchildren = await prisma.category.findMany({
      where: { parentId: { in: children.map((c) => c.id) } },
      select: { id: true },
    });
    for (const c of grandchildren) bookCategoryIds.add(c.id);
  }

  // Scan all products and filter to those with a customAttributes object
  // in JS — more robust than a JSON-path WHERE across Postgres, and the
  // catalog is small enough (~1.2k rows) that this is fine.
  const allProducts = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, categoryId: true, attributes: true },
  });
  const products = allProducts.filter((p) => {
    const a = p.attributes;
    return (
      !!a &&
      typeof a === 'object' &&
      !Array.isArray(a) &&
      typeof (a as Attrs).customAttributes === 'object' &&
      (a as Attrs).customAttributes !== null
    );
  });
  console.log(`\nProducts with customAttributes: ${products.length}\n`);

  let changed = 0;
  let promotedFields = 0;
  let authorRecovered = 0;

  for (const p of products) {
    const attrs: Attrs =
      p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
        ? { ...(p.attributes as Attrs) }
        : {};
    const custom: Attrs =
      attrs.customAttributes && typeof attrs.customAttributes === 'object' && !Array.isArray(attrs.customAttributes)
        ? { ...(attrs.customAttributes as Attrs) }
        : {};
    if (Object.keys(custom).length === 0) continue;

    const promotions: string[] = [];

    for (const [rawKey, rawVal] of Object.entries(custom)) {
      if (rawVal === undefined || rawVal === null || rawVal === '') continue;
      const valStr = String(rawVal).trim();
      if (!valStr) continue;

      // Resolve the def key: exact match, else camelCase→snake_case.
      let defKey: string | undefined;
      if (defTypeByKey.has(rawKey)) defKey = rawKey;
      else {
        const snake = camelToSnake(rawKey);
        if (defTypeByKey.has(snake)) defKey = snake;
      }
      if (!defKey) continue; // no matching def — leave it stashed

      // Non-destructive: don't clobber an existing top-level value.
      const existingTop = attrs[defKey];
      if (existingTop !== undefined && existingTop !== null && existingTop !== '') {
        // Already populated up top; just drop the stash copy.
        delete custom[rawKey];
        continue;
      }

      attrs[defKey] = coerceForType(valStr, defTypeByKey.get(defKey)!);
      delete custom[rawKey];
      promotions.push(`${rawKey}→${defKey}=${JSON.stringify(attrs[defKey])}`);
      promotedFields++;
    }

    // Books-only author recovery.
    let recovered = false;
    if (
      defTypeByKey.has('author') &&
      bookCategoryIds.has(p.categoryId) &&
      (attrs.author === undefined || attrs.author === null || attrs.author === '') &&
      p.brand &&
      p.brand.trim()
    ) {
      attrs.author = p.brand.trim();
      recovered = true;
      authorRecovered++;
    }

    if (promotions.length === 0 && !recovered) continue;

    // Reattach the trimmed customAttributes (or drop it if now empty).
    if (Object.keys(custom).length > 0) attrs.customAttributes = custom;
    else delete attrs.customAttributes;

    changed++;
    console.log(
      `• ${p.name}\n    ${promotions.join(', ')}${recovered ? `${promotions.length ? ', ' : ''}author=${JSON.stringify(attrs.author)} (from brand)` : ''}`,
    );

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { attributes: attrs as object },
      });
    }
  }

  console.log(
    `\n=== ${APPLY ? 'Applied' : 'Would change'}: ${changed} products · ${promotedFields} fields promoted · ${authorRecovered} authors recovered ===`,
  );
  if (!APPLY) console.log('Dry run — re-run with --apply to write.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
