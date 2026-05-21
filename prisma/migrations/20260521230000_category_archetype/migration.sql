-- S2 — Category.archetype field (admin-controlled per-category PDP
-- treatment for mobile). Adds the enum + column + backfill matching
-- the slug→archetype mapping that previously lived in mobile code.

-- CreateEnum
CREATE TYPE "CategoryArchetype" AS ENUM ('GROCERY', 'WINE', 'LIFESTYLE', 'FASHION');

-- AlterTable
ALTER TABLE "Category"
  ADD COLUMN "archetype" "CategoryArchetype" NOT NULL DEFAULT 'FASHION';

-- Backfill — slugs that previously mapped to non-FASHION archetypes
-- in afrizonemart-mobile/src/lib/categoryArchetype.ts. Everything
-- else stays on the FASHION default.
UPDATE "Category" SET "archetype" = 'GROCERY'
  WHERE "slug" IN ('groceries', 'groceries-food-beverages', 'food-beverages');

UPDATE "Category" SET "archetype" = 'WINE'
  WHERE "slug" IN ('beer-wines-spirit', 'wines-spirits');

UPDATE "Category" SET "archetype" = 'LIFESTYLE'
  WHERE "slug" IN ('interior-decor', 'art-collectibles', 'home-essentials', 'automobile');
