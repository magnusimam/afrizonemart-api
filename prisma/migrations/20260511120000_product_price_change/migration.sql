-- Price-management surfaces (PR 1 of 4) — audit log.
-- Every price-mutating code path (inline edit, bulk re-price, CSV
-- import, scheduled flip, manual save, revert) writes a row here
-- via the `applyPriceChange()` service helper.

CREATE TYPE "PriceChangeSource" AS ENUM (
  'INLINE',
  'BULK',
  'CSV',
  'SCHEDULED',
  'MANUAL',
  'REVERT'
);

CREATE TABLE "ProductPriceChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldPrice" INTEGER,
    "newPrice" INTEGER NOT NULL,
    "oldComparePrice" INTEGER,
    "newComparePrice" INTEGER,
    "changedById" TEXT,
    "source" "PriceChangeSource" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPriceChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductPriceChange_productId_createdAt_idx"
  ON "ProductPriceChange"("productId", "createdAt");

CREATE INDEX "ProductPriceChange_changedById_idx"
  ON "ProductPriceChange"("changedById");

ALTER TABLE "ProductPriceChange"
  ADD CONSTRAINT "ProductPriceChange_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPriceChange"
  ADD CONSTRAINT "ProductPriceChange_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
