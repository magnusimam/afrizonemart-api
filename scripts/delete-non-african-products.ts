/**
 * Dry-run + execute deletion of non-African catalog items.
 *
 * Usage:
 *   ts-node scripts/delete-non-african-products.ts          # dry-run preview
 *   ts-node scripts/delete-non-african-products.ts --apply  # actually delete
 *
 * - Matches each TARGET name against `Product.name`, exact case-insensitive
 *   first, falls back to `contains` for stragglers (rare slight wording diff).
 * - Reports image count + per-intern submission count BEFORE deleting.
 * - On --apply, deletes via the same code path the admin UI uses, so:
 *     · R2 images cleaned via deleteImagesByUrl
 *     · ProductImageSubmission rows cascade out (intern count auto-drops)
 *     · Cart items + reviews removed
 *     · Products with order history are SKIPPED (the existing safety rule)
 */
import { PrismaClient } from '@prisma/client';
import { deleteImagesByUrl } from '../src/modules/uploads/cleanup';

const prisma = new PrismaClient();

// Each entry is { name, hint } — `name` is matched against Product.name
// (case-insensitive), `hint` is informational only (the country in [] in
// Magnus' list). When two products in the catalog share a brand name
// the hint lets a human eyeball which one we matched.
const TARGETS: { name: string; hint?: string; source: string }[] = [
  // ===== groceries.csv =====
  { source: 'groceries', name: 'Caprice Parboiled Rice 50kg', hint: 'TH' },
  { source: 'groceries', name: 'Lal Qilla Basmati Rice 5kg', hint: 'IN' },
  { source: 'groceries', name: 'Aani Premium Basmati Rice 10kg', hint: 'IN' },
  { source: 'groceries', name: 'Brown Lentils 500g', hint: 'GB' },
  { source: 'groceries', name: 'Goya Extra Virgin Olive Oil 1L', hint: 'ES' },
  { source: 'groceries', name: 'Ducros Curry Powder 25g', hint: 'FR' },
  { source: 'groceries', name: 'Ducros Thyme 10g', hint: 'FR' },
  { source: 'groceries', name: 'Black Pepper Ground 100g', hint: 'GB' },
  { source: 'groceries', name: 'White Pepper Ground 100g', hint: 'GB' },
  { source: 'groceries', name: 'Ground Ginger 100g', hint: 'GB' },
  { source: 'groceries', name: 'Ground Garlic 100g', hint: 'GB' },
  { source: 'groceries', name: 'Paprika Powder 100g', hint: 'GB' },
  { source: 'groceries', name: 'Cinnamon Powder 50g', hint: 'GB' },
  { source: 'groceries', name: 'Bay Leaves 25g', hint: 'GB' },
  { source: 'groceries', name: 'Whole Cloves 50g', hint: 'GB' },
  { source: 'groceries', name: 'Heinz Tomato Ketchup 460g', hint: 'GB' },
  { source: 'groceries', name: 'Geisha Mackerel in Tomato Sauce 425g', hint: 'TH' },
  { source: 'groceries', name: 'Queens Mackerel in Tomato Sauce 425g', hint: 'TH' },
  { source: 'groceries', name: 'Heinz Baked Beans 415g', hint: 'GB' },
  { source: 'groceries', name: "Kellogg's Cornflakes 500g", hint: 'US' },
  { source: 'groceries', name: 'Quaker Oats 1kg', hint: 'US' },
  { source: 'groceries', name: 'Quaker Oats 500g', hint: 'US' },
  { source: 'groceries', name: "Kellogg's Coco Pops 375g", hint: 'US' },
  { source: 'groceries', name: 'Dano Milk Powder 380g', hint: 'DK' },
  { source: 'groceries', name: 'Dano Cool Cow Sachet 12g x 12', hint: 'DK' },
  { source: 'groceries', name: 'Nescafe Classic 100g Jar', hint: 'CH' },
  { source: 'groceries', name: 'Nescafe 3-in-1 18g x 20', hint: 'CH' },
  { source: 'groceries', name: "Smucker's Strawberry Jam 340g", hint: 'US' },
  { source: 'groceries', name: 'Goya Peanut Butter 500g', hint: 'US' },
  { source: 'groceries', name: 'Digestive Cream Biscuits 200g', hint: 'GB' },
  { source: 'groceries', name: 'Pringles Original 165g', hint: 'US' },

  // ===== groceries-by-company.csv =====
  { source: 'groceries-by-company', name: 'Nescafe Classic Sachet 1.8g x 50', hint: 'CH' },
  { source: 'groceries-by-company', name: 'Caprice Parboiled Rice 25kg', hint: 'TH' },
  { source: 'groceries-by-company', name: 'Caprice Parboiled Rice 10kg', hint: 'TH' },
  { source: 'groceries-by-company', name: 'Dano Slim Milk Powder 380g', hint: 'DK' },
  { source: 'groceries-by-company', name: 'Dano Cool Cow Milk Powder 350g Tin', hint: 'DK' },
  { source: 'groceries-by-company', name: 'Dano Cool Cow Sachet 12g x 24 (Carton)', hint: 'DK' },
  { source: 'groceries-by-company', name: 'Dano Full Cream Milk Powder 900g Tin', hint: 'DK' },
  { source: 'groceries-by-company', name: 'Dano Cool Cow 900g Tin', hint: 'DK' },

  // ===== drinks.csv =====
  { source: 'drinks', name: 'Lucozade Boost Original 38cl PET', hint: 'GB' },
  { source: 'drinks', name: 'Lucozade Boost Tropical 38cl PET', hint: 'GB' },
  { source: 'drinks', name: 'Lucozade Sport Orange 50cl PET', hint: 'GB' },
  { source: 'drinks', name: 'Lucozade Energy Original 1L PET', hint: 'GB' },
  { source: 'drinks', name: 'Lucozade Energy 50cl PET', hint: 'GB' },
  { source: 'drinks', name: 'Power Horse Energy Drink 25cl Can', hint: 'AT' },
  { source: 'drinks', name: 'Red Bull Energy Drink 25cl Can', hint: 'AT' },
  { source: 'drinks', name: 'Monster Energy Drink 50cl Can', hint: 'US' },
  { source: 'drinks', name: 'Ribena Blackcurrant Concentrate 600ml', hint: 'GB' },
  { source: 'drinks', name: 'Ribena Original Ready-to-Drink 25cl', hint: 'GB' },
  { source: 'drinks', name: 'Ribena Strawberry Concentrate 600ml', hint: 'GB' },
  { source: 'drinks', name: 'Vitamilk Original Soya Milk 30cl x 12', hint: 'TH' },
  { source: 'drinks', name: 'Vitamilk Choco Soya Milk 30cl x 12', hint: 'TH' },
  { source: 'drinks', name: 'Budweiser Beer 33cl Can', hint: 'US' },
  { source: 'drinks', name: 'Stella Artois 33cl Bottle', hint: 'BE' },
  { source: 'drinks', name: 'Corona Extra 33cl Bottle', hint: 'MX' },
  { source: 'drinks', name: 'Carlo Rossi Sweet Red 1.5L', hint: 'US' },
  { source: 'drinks', name: 'Andre Cold Duck Sparkling Wine 75cl', hint: 'US' },
  { source: 'drinks', name: 'Eva Wine Sweet Red 75cl', hint: 'ES' },
  { source: 'drinks', name: 'Don Simon Tetra Pak Wine 1L', hint: 'ES' },
  { source: 'drinks', name: 'Smirnoff Vodka 75cl Bottle', hint: 'RU' },
  { source: 'drinks', name: 'Captain Morgan Spiced Rum 75cl', hint: 'GB' },
  { source: 'drinks', name: 'Hennessy VS Cognac 70cl', hint: 'FR' },
  { source: 'drinks', name: 'Jameson Irish Whiskey 70cl', hint: 'IE' },
  { source: 'drinks', name: 'Johnnie Walker Red Label 75cl', hint: 'GB' },
  { source: 'drinks', name: 'Johnnie Walker Black Label 75cl', hint: 'GB' },
  { source: 'drinks', name: 'Glenfiddich 12 Year Single Malt 75cl', hint: 'GB' },
  { source: 'drinks', name: '8pm Whisky 75cl', hint: 'IN' },
  { source: 'drinks', name: 'Baileys Original Irish Cream 70cl', hint: 'IE' },
  { source: 'drinks', name: 'Campari Liqueur 70cl', hint: 'IT' },
  { source: 'drinks', name: 'Jägermeister Herbal Liqueur 70cl', hint: 'DE' },
];

async function resolveTargets() {
  const matched: {
    target: (typeof TARGETS)[number];
    productId: string;
    productName: string;
    origin: string | null;
    images: string[];
  }[] = [];
  const unmatched: typeof TARGETS = [];
  const ambiguous: { target: (typeof TARGETS)[number]; candidates: string[] }[] = [];

  for (const t of TARGETS) {
    const rows = await prisma.product.findMany({
      where: { name: { equals: t.name, mode: 'insensitive' } },
      select: { id: true, name: true, origin: true, images: true },
    });
    if (rows.length === 1) {
      matched.push({
        target: t,
        productId: rows[0].id,
        productName: rows[0].name,
        origin: rows[0].origin,
        images: rows[0].images,
      });
    } else if (rows.length > 1) {
      ambiguous.push({ target: t, candidates: rows.map((r) => `${r.id} (${r.name})`) });
    } else {
      // Fall back to a contains search on the most distinctive ~25 chars
      const probe = t.name.slice(0, 25);
      const fuzz = await prisma.product.findMany({
        where: { name: { contains: probe, mode: 'insensitive' } },
        select: { id: true, name: true, origin: true, images: true },
      });
      if (fuzz.length === 1) {
        matched.push({
          target: t,
          productId: fuzz[0].id,
          productName: fuzz[0].name,
          origin: fuzz[0].origin,
          images: fuzz[0].images,
        });
      } else if (fuzz.length > 1) {
        ambiguous.push({ target: t, candidates: fuzz.map((r) => `${r.id} (${r.name})`) });
      } else {
        unmatched.push(t);
      }
    }
  }
  return { matched, unmatched, ambiguous };
}

async function findHuggies() {
  return prisma.product.findMany({
    where: { name: { contains: 'Huggies', mode: 'insensitive' } },
    select: { id: true, name: true, origin: true, images: true },
  });
}

async function impactReport(productIds: string[]) {
  const orderItemBlocked = await prisma.orderItem.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true },
    distinct: ['productId'],
  });
  const submissions = await prisma.productImageSubmission.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, internId: true, status: true, payRate: true, intern: { select: { email: true, name: true } } },
  });
  const byIntern = new Map<string, { name: string | null; email: string; total: number; approved: number; payApproved: number }>();
  for (const s of submissions) {
    const k = s.internId;
    if (!byIntern.has(k)) byIntern.set(k, { name: s.intern.name, email: s.intern.email, total: 0, approved: 0, payApproved: 0 });
    const agg = byIntern.get(k)!;
    agg.total += 1;
    if (s.status === 'APPROVED') {
      agg.approved += 1;
      agg.payApproved += s.payRate;
    }
  }
  return {
    orderBlocked: new Set(orderItemBlocked.map((o) => o.productId)),
    submissionsTotal: submissions.length,
    byIntern,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`\n=== ${apply ? 'EXECUTE' : 'DRY RUN'} — non-African catalog cleanup ===\n`);

  const { matched, unmatched, ambiguous } = await resolveTargets();
  const huggies = await findHuggies();

  console.log(`Matched: ${matched.length}/${TARGETS.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Ambiguous: ${ambiguous.length}`);
  console.log(`Huggies in catalog: ${huggies.length}\n`);

  if (unmatched.length) {
    console.log('--- UNMATCHED (no DB row) ---');
    for (const u of unmatched) console.log(`  · ${u.source.padEnd(22)} ${u.name}  [${u.hint ?? '?'}]`);
    console.log();
  }
  if (ambiguous.length) {
    console.log('--- AMBIGUOUS (multiple matches — needs human pick) ---');
    for (const a of ambiguous) {
      console.log(`  · ${a.target.name}`);
      a.candidates.forEach((c) => console.log(`      → ${c}`));
    }
    console.log();
  }
  if (huggies.length) {
    console.log('--- HUGGIES products in catalog ---');
    for (const h of huggies) console.log(`  · ${h.id}  ${h.name}  origin=${h.origin ?? '-'}`);
    console.log();
  }

  const allIds = [...matched.map((m) => m.productId), ...huggies.map((h) => h.id)];
  const impact = await impactReport(allIds);

  const totalImages = matched.reduce((s, m) => s + m.images.length, 0) + huggies.reduce((s, h) => s + h.images.length, 0);
  console.log(`Total to delete: ${allIds.length} products  (${matched.length} listed + ${huggies.length} huggies)`);
  console.log(`R2 images to remove: ${totalImages}`);
  console.log(`Order-blocked (cannot delete — has order history): ${impact.orderBlocked.size}`);
  console.log(`Intern submissions to cascade: ${impact.submissionsTotal}`);
  if (impact.byIntern.size) {
    console.log('\n--- Per-intern impact (submissions cascading out) ---');
    for (const [, v] of impact.byIntern) {
      console.log(`  · ${(v.name ?? '(no name)').padEnd(20)} <${v.email}> — ${v.total} total, ${v.approved} approved (−NGN ${v.payApproved.toLocaleString('en-NG')})`);
    }
  }

  if (!apply) {
    console.log('\n[dry-run] Re-run with --apply to execute. Order-blocked products will be skipped.');
    await prisma.$disconnect();
    return;
  }

  // --- EXECUTE PATH ---
  const deletable = allIds.filter((id) => !impact.orderBlocked.has(id));
  const skipped = allIds.filter((id) => impact.orderBlocked.has(id));
  console.log(`\nDeleting ${deletable.length} products (skipping ${skipped.length} with order history)…`);

  const imageUrlsToWipe = [
    ...matched.filter((m) => !impact.orderBlocked.has(m.productId)).flatMap((m) => m.images),
    ...huggies.filter((h) => !impact.orderBlocked.has(h.id)).flatMap((h) => h.images),
  ];

  // Mirrors the same sequence the bulk admin endpoint uses:
  // collect images, then cart-items + reviews, then product, then R2.
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { productId: { in: deletable } } }),
    prisma.review.deleteMany({ where: { productId: { in: deletable } } }),
    prisma.product.deleteMany({ where: { id: { in: deletable } } }),
  ]);
  console.log(`DB deletes complete.`);

  if (imageUrlsToWipe.length > 0) {
    const r = await deleteImagesByUrl(imageUrlsToWipe);
    console.log(`R2: ${r.deleted}/${imageUrlsToWipe.length} images removed (${r.skipped} skipped, ${r.failed} failed)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
