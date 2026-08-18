-- Take50 production shoots (Stage 8 content capture).

-- CreateEnum
CREATE TYPE "ProductionBookingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductionBooking" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "ProductionBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "productList" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "bookedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBooking_supplierId_key" ON "ProductionBooking"("supplierId");

-- CreateIndex
CREATE INDEX "ProductionBooking_status_idx" ON "ProductionBooking"("status");

-- CreateIndex
CREATE INDEX "ProductionBooking_scheduledAt_idx" ON "ProductionBooking"("scheduledAt");

-- AddForeignKey
ALTER TABLE "ProductionBooking" ADD CONSTRAINT "ProductionBooking_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBooking" ADD CONSTRAINT "ProductionBooking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
