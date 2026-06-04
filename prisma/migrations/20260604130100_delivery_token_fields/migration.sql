-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryToken" TEXT,
ADD COLUMN     "deliveryOtp" TEXT,
ADD COLUMN     "deliveredSource" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- CreateIndex
-- Lookup by OTP filters to OUT_FOR_DELIVERY only, so a plain btree
-- on deliveryOtp is enough. Collision chance is negligible (6-digit
-- OTP × few-hundred active deliveries) and the status filter
-- disambiguates.
CREATE INDEX "Order_deliveryOtp_idx" ON "Order"("deliveryOtp");
