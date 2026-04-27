-- CreateTable
CREATE TABLE "ProductPlacement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPlacement_placement_sortOrder_idx" ON "ProductPlacement"("placement", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPlacement_productId_placement_key" ON "ProductPlacement"("productId", "placement");

-- AddForeignKey
ALTER TABLE "ProductPlacement" ADD CONSTRAINT "ProductPlacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
