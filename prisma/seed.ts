import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface ProductBundle {
  units: number;
  label: string;
  price: number;
  comparePrice: number;
  savings?: number;
  popular?: boolean;
}

interface ProductFeature {
  icon: 'sparkles' | 'leaf' | 'globe' | 'shield' | 'heart' | 'check' | 'gem';
  text: string;
}

interface ProductSpec {
  label: string;
  value: string;
}

interface ProductAttributes {
  bundles: ProductBundle[];
  features: ProductFeature[];
  specifications: ProductSpec[];
  variants?: { type: string; options: string[]; default: string };
  aboutTitle: string;
  aboutBody: string;
  aboutImage: string;
}

interface SeedReview {
  authorName: string;
  authorCountry?: string;
  rating: number;
  title?: string;
  body: string;
  verified?: boolean;
}

interface SeedProduct {
  slug: string;
  name: string;
  brand?: string;
  shortDescription?: string;
  description?: string;
  ingredients?: string;
  price: number;
  comparePrice?: number;
  origin: string;
  inStock?: boolean;
  rating?: number;
  reviewCount?: number;
  images?: string[];
  categorySlug: string;
  attributes?: Partial<ProductAttributes>;
  reviews?: SeedReview[];
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

/**
 * Default rich-content attributes — applied to any product that doesn't
 * specify its own. Bundle pricing scales off the unit price so the
 * defaults make sense for both ₦150 drinks and ₦250k furniture.
 */
function defaultAttributes(p: SeedProduct): ProductAttributes {
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
      { label: 'Origin', value: p.origin },
      { label: 'Brand', value: p.brand ?? 'Various' },
    ],
    aboutTitle: `About ${p.name}`,
    aboutBody:
      p.description ??
      'A quality product brought to you from across Africa. Discover authentic items from artisans, farmers, and brands you can trust — with every purchase supporting communities across the continent.',
    aboutImage: '/images/featured/for-her.jpg',
  };
}

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
    shortDescription:
      'Reveal radiant skin with our gentle exfoliating scrub — handcrafted with Himalayan minerals and West African shea butter.',
    description:
      'Maya Himalaya Facial Scrub is a luxurious exfoliator that combines the mineral-rich power of Himalayan pink salt with creamy West African shea butter and East African rosehip oil. The result is a gentle yet effective scrub that buffs away dead skin without stripping your natural moisture barrier. Suitable for all skin types — including sensitive — and 100% cruelty-free. Each batch is hand-poured in our Lagos workshop in small runs to guarantee freshness.',
    ingredients:
      'Sucrose, Coconut Oil, Glycerin, Himalayan Pink Salt, Shea Butter (Butyrospermum Parkii), Rosehip Oil, Vitamin E, Natural Fragrance, Plant-derived antioxidants.',
    price: 3800,
    comparePrice: 5000,
    origin: 'NG',
    rating: 4.8,
    reviewCount: 342,
    categorySlug: 'beauty',
    attributes: {
      bundles: [
        { units: 1, label: '1 Pack', price: 3800, comparePrice: 5000 },
        { units: 3, label: '3 Pack', price: 9500, comparePrice: 15000, savings: 37, popular: true },
        { units: 6, label: '6 Pack', price: 17000, comparePrice: 30000, savings: 43 },
      ],
      features: [
        { icon: 'leaf', text: '100% natural ingredients sourced across Africa' },
        { icon: 'sparkles', text: 'Gentle exfoliation safe for daily use' },
        { icon: 'globe', text: 'Pan-African artisanal sourcing — Nigeria, Ghana, Kenya' },
        { icon: 'shield', text: 'Cruelty-free and dermatologist tested' },
      ],
      specifications: [
        { label: 'Net Weight', value: '120g' },
        { label: 'Dimensions', value: '5 × 5 × 8 cm' },
        { label: 'Skin Type', value: 'All skin types incl. sensitive' },
        { label: 'Origin', value: 'Lagos, Nigeria' },
        { label: 'Shelf Life', value: '24 months unopened' },
        { label: 'Vegan', value: 'Yes' },
      ],
      variants: { type: 'Size', options: ['50ml', '100ml', '200ml'], default: '100ml' },
      aboutTitle: 'Reveal Your Natural Glow',
      aboutBody:
        "Maya Himalaya Facial Scrub is hand-crafted in Lagos using a centuries-old African beauty ritual reimagined for modern skin. Each batch combines Himalayan pink salt with shea butter from West Africa and rosehip oil from East African highlands — a true pan-African beauty experience that exfoliates without stripping. We work directly with women's cooperatives across the continent to source our ingredients, supporting over 200 families and ensuring every jar carries the story of Africa's natural beauty.",
      aboutImage: '/images/featured/for-her.jpg',
    },
    reviews: [
      { authorName: 'Adaeze O.', authorCountry: 'NG', rating: 5, title: 'Skin transformation in 2 weeks', body: 'I have sensitive skin and most scrubs leave me red and irritated. Maya is the gentlest scrub I have ever used and my skin glows after every use. Will buy the 6-pack next time!', verified: true },
      { authorName: 'Naledi M.', authorCountry: 'ZA', rating: 5, title: 'Best skincare from Africa', body: "Shipping to Joburg was fast and the packaging is gorgeous. The shea butter smell is heavenly. I love that it's truly pan-African.", verified: true },
      { authorName: 'Amina K.', authorCountry: 'KE', rating: 4, title: 'Love the scent, wish jar was bigger', body: 'Excellent product but the 100ml goes fast if you use it 3x a week. Switched to the 200ml which is much better value.', verified: true },
      { authorName: 'Fatima B.', authorCountry: 'EG', rating: 5, title: 'Glowing skin in Cairo', body: 'In our dry climate exfoliation is critical and most products feel harsh. This one is balm-like, my skin feels soft for hours.', verified: true },
    ],
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

function discountPercent(price: number, comparePrice?: number): number | null {
  if (!comparePrice || comparePrice <= price) return null;
  return Math.round(((comparePrice - price) / comparePrice) * 100);
}

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

    const baseAttrs = defaultAttributes(p);
    const attributes: ProductAttributes = {
      ...baseAttrs,
      ...(p.attributes ?? {}),
    } as ProductAttributes;

    const productData = {
      slug: p.slug,
      name: p.name,
      brand: p.brand ?? null,
      shortDescription: p.shortDescription ?? null,
      description: p.description ?? null,
      ingredients: p.ingredients ?? null,
      price: p.price,
      comparePrice: p.comparePrice ?? null,
      discountPercent: discountPercent(p.price, p.comparePrice),
      origin: p.origin,
      inStock: p.inStock ?? true,
      rating: p.rating ?? 0,
      reviewCount: p.reviewCount ?? (p.reviews?.length ?? 0),
      images: p.images ?? [],
      attributes: attributes as unknown as Prisma.InputJsonValue,
      categoryId,
    };

    const upserted = await prisma.product.upsert({
      where: { slug: p.slug },
      create: productData,
      update: productData,
    });

    if (p.reviews?.length) {
      // Replace reviews on every seed run for predictability.
      await prisma.review.deleteMany({ where: { productId: upserted.id } });
      await prisma.review.createMany({
        data: p.reviews.map((r) => ({
          productId: upserted.id,
          authorName: r.authorName,
          authorCountry: r.authorCountry ?? null,
          rating: r.rating,
          title: r.title ?? null,
          body: r.body,
          verified: r.verified ?? false,
        })),
      });
    }

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
