import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedProduct {
  slug: string;
  name: string;
  brand?: string;
  description?: string;
  price: number;
  comparePrice?: number;
  origin: string;
  inStock?: boolean;
  rating?: number;
  reviewCount?: number;
  images?: string[];
  categorySlug: string;
}

const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'groceries', name: 'Groceries, Food & Beverages' },
  { slug: 'beauty', name: 'Beauty & Personal Care' },
  { slug: 'for-her', name: 'For Her' },
  { slug: 'for-him', name: 'For Him' },
  { slug: 'home-essentials', name: 'Home Essentials' },
  { slug: 'beer-wines-spirit', name: 'Beer, Wines & Spirit' },
  { slug: 'interior-decor', name: 'Interior Decor' },
  { slug: 'art-collectibles', name: 'Art & Collectibles' },
  { slug: 'books', name: 'Books' },
];

const PRODUCTS: SeedProduct[] = [
  // Groceries (24)
  { slug: 'big-bites-lemon-60cl', name: 'Big Bites Lemon 60cl', price: 150, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'on-ice-tea-lemon-1l', name: 'On Ice Tea Lemon 1 Litre', price: 435, origin: 'KE', categorySlug: 'groceries' },
  { slug: 'cn-olivita-lychee-1l', name: 'CN Olivita 100% Lychee Fruit Juice 1L', price: 350, origin: 'EG', inStock: false, categorySlug: 'groceries' },
  { slug: 'golden-penny-choc-oh', name: 'Golden Penny Choc-Oh Spread', price: 450, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'malta-guinness', name: 'Malta Guinness', price: 500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'tastic-rice-2kg', name: 'Tastic Long Grain Rice 2kg', price: 2200, origin: 'ZA', categorySlug: 'groceries' },
  { slug: 'apple-moringa-100g', name: 'Apple Wholesome Foods Moringa Leaf Powder 100g', price: 6200, origin: 'KE', categorySlug: 'groceries' },
  { slug: 'spectra-cocoa-powder', name: 'Spectra Cocoa Powder', price: 500, origin: 'GH', inStock: false, categorySlug: 'groceries' },
  { slug: 'mattanis-25cl', name: 'Mattanis 25cl', price: 450, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'five-crowns-sparkling-rose', name: 'Five Crowns Natural Sweet Rose Aperitif 75cl', price: 5974, origin: 'ZA', categorySlug: 'groceries' },
  { slug: 'golden-penny-semovita-4kg', name: 'Golden Penny Semovita 4kg', price: 2000, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'golden-penny-flour-4kg', name: 'Golden Penny Classic Flour 4kg', price: 3500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'nestle-cerelac-6kg', name: 'Nestle Cerelac Maize-Mai with Milk 6kg', price: 1499, origin: 'CM', categorySlug: 'groceries' },
  { slug: 'four-cousins-brut-x6', name: 'Four Cousins Sparkling Brut 750ml × 6', price: 5974, origin: 'ZA', categorySlug: 'groceries' },
  { slug: 'infinity-puff-mix', name: 'Infinity Instant Puff Puff Mix 90g × 6', price: 1750, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'big-ginger-lemon-x6', name: 'Big Ginger Lemon 60cl × 6', price: 1500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'golden-penny-sugar-500g', name: 'Golden Penny Granulated Sugar 500g', price: 500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'power-pasta-500g', name: 'Power Pasta Spaghetti — Regular 500g', price: 1100, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'big-reserved-x12', name: 'Big Reserved 60cl × 12 (3 pack)', price: 1500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'smoked-catfish-25g', name: 'Smoked Catfish 25g', price: 500, comparePrice: 1200, origin: 'GH', categorySlug: 'groceries' },
  { slug: 'pepsi-cola-x12', name: 'Pepsi-Cola 60cl × 12', price: 1500, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'life-continental-lager-x4', name: 'Life Continental Lager 60cl × 4 pack', price: 1800, origin: 'NG', categorySlug: 'groceries' },
  { slug: 'today-decaf', name: 'Today Decaf', price: 700, comparePrice: 999, origin: 'ET', inStock: false, categorySlug: 'groceries' },
  { slug: 'tastic-rice-5kg', name: 'Tastic Long Grain Rice 5kg', price: 6700, origin: 'ZA', categorySlug: 'groceries' },

  // Beauty (8)
  {
    slug: 'maya-himalaya-facial-scrub',
    name: 'Maya Himalaya Facial Scrub',
    brand: 'Maya Naturals',
    description: 'Gentle exfoliating scrub with Himalayan salt and West African shea butter. 100% natural, dermatologist tested.',
    price: 3800,
    comparePrice: 5000,
    origin: 'NG',
    rating: 4.8,
    reviewCount: 342,
    categorySlug: 'beauty',
  },
  { slug: 'tara-bronzer', name: 'Tara Bronzer', price: 3200, comparePrice: 4000, origin: 'EG', categorySlug: 'beauty' },
  { slug: 'fanda-lipstick', name: 'Fanda Lipstick', price: 1000, origin: 'NG', categorySlug: 'beauty' },
  { slug: 'bi-bi-doll-browpencil', name: 'Bi Bi Doll Browpencil', price: 800, origin: 'NG', categorySlug: 'beauty' },
  { slug: 'tara-half-dual-powder', name: 'Tara Half-Dual Powder Palette', price: 4500, origin: 'EG', categorySlug: 'beauty' },
  { slug: 'opera-silky-pressed', name: 'Opera Silky Pressed Powder', price: 3500, origin: 'KE', categorySlug: 'beauty' },
  { slug: 'snow-foundation', name: 'Snow Total Coverage Foundation', price: 4800, origin: 'ZA', categorySlug: 'beauty' },
  { slug: 'zeezom-henna-gloss', name: 'ZeeZom Henna Hair Gloss', price: 2600, origin: 'EG', categorySlug: 'beauty' },

  // Furniture / Interior (6)
  { slug: 'bridie-day-bed', name: 'Bridie Day Bed - Chaise Lounge', price: 250000, origin: 'ZA', categorySlug: 'interior-decor' },
  { slug: 'genuine-leather-couch', name: 'Genuine White Leather Couch', price: 215000, comparePrice: 280000, origin: 'MA', categorySlug: 'interior-decor' },
  { slug: 'glynn-day-bed', name: 'Glynn Day Bed Chaise Lounge', price: 250000, origin: 'KE', categorySlug: 'interior-decor' },
  { slug: 'ann-chair-20', name: 'Ann Chair 20', price: 140000, origin: 'ZA', categorySlug: 'interior-decor' },
  { slug: 'tv-stand-109', name: 'TV Stand 109', price: 255000, comparePrice: 300000, origin: 'ZA', categorySlug: 'interior-decor' },
  { slug: 'eboin-chaise-lounge', name: 'Eboin Chaise Lounge', price: 110000, origin: 'KE', categorySlug: 'interior-decor' },

  // Books (6 — by African authors)
  { slug: 'no-longer-at-ease', name: 'No Longer At Ease by Chinua Achebe', price: 36480, origin: 'NG', categorySlug: 'books' },
  { slug: 'set-forth-at-dawn', name: 'You Must Set Forth At Dawn: A Memoir by Wole Soyinka', price: 2150, origin: 'NG', categorySlug: 'books' },
  { slug: 'season-of-crimson-blossom', name: 'Season Of Crimson Blossom by Abubakar Adam Ibrahim', price: 10540, origin: 'NG', categorySlug: 'books' },
  { slug: 'destiny-formula', name: 'Destiny Formula by Ayodeji Awosika', price: 16150, origin: 'NG', categorySlug: 'books' },
  { slug: 'why-dont-you-carve-other-animals', name: "Why Don't You Carve Other Animals by Yvonne Vera", price: 22000, origin: 'ZW', categorySlug: 'books' },
  { slug: 'known-and-strange-things', name: 'Known And Strange Things by Teju Cole', price: 19950, origin: 'NG', categorySlug: 'books' },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  console.log('  Categories:');
  const categoryMap = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name },
      update: { name: c.name },
    });
    categoryMap.set(c.slug, cat.id);
    console.log(`    ✓ ${c.name}`);
  }

  console.log(`\n  Products (${PRODUCTS.length}):`);
  for (const p of PRODUCTS) {
    const categoryId = categoryMap.get(p.categorySlug);
    if (!categoryId) {
      console.warn(`    ⚠ skip ${p.slug}: unknown category ${p.categorySlug}`);
      continue;
    }

    await prisma.product.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        brand: p.brand ?? null,
        description: p.description ?? null,
        price: p.price,
        comparePrice: p.comparePrice ?? null,
        origin: p.origin,
        inStock: p.inStock ?? true,
        rating: p.rating ?? 0,
        reviewCount: p.reviewCount ?? 0,
        images: p.images ?? [],
        categoryId,
      },
      update: {
        name: p.name,
        brand: p.brand ?? null,
        description: p.description ?? null,
        price: p.price,
        comparePrice: p.comparePrice ?? null,
        origin: p.origin,
        inStock: p.inStock ?? true,
        rating: p.rating ?? 0,
        reviewCount: p.reviewCount ?? 0,
        images: p.images ?? [],
        categoryId,
      },
    });
    console.log(`    ✓ ${p.name}`);
  }

  console.log(`\n✅ Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} products.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
