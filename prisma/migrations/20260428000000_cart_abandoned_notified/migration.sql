-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "abandonedNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Cart_updatedAt_abandonedNotifiedAt_idx" ON "Cart"("updatedAt", "abandonedNotifiedAt");
