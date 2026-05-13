-- Tracker #45 — promote bundles to first-class ProductVariant rows.
-- See ARCHITECTURE_TRACKER.md item 45 for context.

-- 1. New table -----------------------------------------------------

CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceNgn" INTEGER NOT NULL,
    "comparePriceNgn" INTEGER,
    "unitsPerPack" INTEGER NOT NULL DEFAULT 1,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_productId_sortOrder_idx" ON "ProductVariant"("productId", "sortOrder");

ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill one+ variants per existing Product ------------------
-- Products WITH bundles in attributes.bundles: one variant per bundle.
INSERT INTO "ProductVariant" (
    "id", "productId", "label", "priceNgn", "comparePriceNgn",
    "unitsPerPack", "inStock", "sortOrder", "isDefault",
    "createdAt", "updatedAt"
)
SELECT
    'var_' || replace(gen_random_uuid()::text, '-', ''),
    p.id,
    COALESCE(NULLIF(b.value->>'label', ''), 'Default'),
    COALESCE((b.value->>'price')::int, p.price),
    NULLIF((b.value->>'comparePrice')::int, 0),
    COALESCE((b.value->>'units')::int, 1),
    p."inStock",
    (b.ord - 1)::int,
    (b.ord = 1),
    NOW(),
    NOW()
FROM "Product" p
CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(p.attributes->'bundles', '[]'::jsonb)
) WITH ORDINALITY AS b(value, ord)
WHERE jsonb_typeof(p.attributes->'bundles') = 'array'
  AND jsonb_array_length(p.attributes->'bundles') > 0;

-- Products WITHOUT bundles: single default variant from base price.
INSERT INTO "ProductVariant" (
    "id", "productId", "label", "priceNgn", "comparePriceNgn",
    "unitsPerPack", "inStock", "sortOrder", "isDefault",
    "createdAt", "updatedAt"
)
SELECT
    'var_' || replace(gen_random_uuid()::text, '-', ''),
    p.id,
    'Default',
    p.price,
    p."comparePrice",
    1,
    p."inStock",
    0,
    true,
    NOW(),
    NOW()
FROM "Product" p
WHERE jsonb_typeof(p.attributes->'bundles') IS DISTINCT FROM 'array'
   OR jsonb_array_length(COALESCE(p.attributes->'bundles', '[]'::jsonb)) = 0;

-- 3. CartItem: point at variant ------------------------------------

ALTER TABLE "CartItem" ADD COLUMN "productVariantId" TEXT;
ALTER TABLE "CartItem" ADD COLUMN "variantLabel"     TEXT;

-- Backfill: every existing CartItem points at its product's default variant.
UPDATE "CartItem" ci
SET "productVariantId" = (
    SELECT pv.id FROM "ProductVariant" pv
    WHERE pv."productId" = ci."productId"
    ORDER BY pv."isDefault" DESC, pv."sortOrder" ASC
    LIMIT 1
);

-- Any cart item that didn't get a variant points at a product that
-- no longer exists (the Product FK would already be broken). Drop them.
DELETE FROM "CartItem" WHERE "productVariantId" IS NULL;

DROP INDEX "CartItem_cartId_productId_key";

ALTER TABLE "CartItem" ALTER COLUMN "productVariantId" SET NOT NULL;
CREATE UNIQUE INDEX "CartItem_cartId_productVariantId_key" ON "CartItem"("cartId", "productVariantId");
CREATE INDEX "CartItem_productVariantId_idx" ON "CartItem"("productVariantId");

ALTER TABLE "CartItem"
    ADD CONSTRAINT "CartItem_productVariantId_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. OrderItem: variant snapshot fields ----------------------------
-- Nullable on legacy rows; new orders always set these.

ALTER TABLE "OrderItem" ADD COLUMN "productVariantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "bundleLabel"      TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantLabel"     TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "unitsPerPack"     INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");

ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_productVariantId_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
