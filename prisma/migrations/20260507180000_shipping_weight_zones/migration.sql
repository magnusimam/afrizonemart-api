-- Phase 11 (Shipping & delivery v1) — weight + sub-country zones.

-- Per-product weight in kg. Nullable; the quote engine treats null as
-- 0.5 kg (small package) so existing rows ship without a backfill.
ALTER TABLE "Product" ADD COLUMN "weightKg" DOUBLE PRECISION;

-- Optional sub-country city restriction. Empty = whole country.
ALTER TABLE "ShippingZone" ADD COLUMN "cities" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;

-- Weight bracket bounds + ETA range on shipping rates.
ALTER TABLE "ShippingRate" ADD COLUMN "minWeightKg" DOUBLE PRECISION;
ALTER TABLE "ShippingRate" ADD COLUMN "maxWeightKg" DOUBLE PRECISION;
ALTER TABLE "ShippingRate" ADD COLUMN "etaDaysMin" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "ShippingRate" ADD COLUMN "etaDaysMax" INTEGER NOT NULL DEFAULT 7;

-- Which provider produced the quote that was chosen at checkout. Null
-- on legacy orders; defaults to 'manual' going forward.
ALTER TABLE "Order" ADD COLUMN "shippingProvider" TEXT DEFAULT 'manual';
