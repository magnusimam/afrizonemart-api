-- AlterTable
ALTER TABLE "Review" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hiddenReason" TEXT;

-- CreateIndex
-- Partial index on hidden reviews so admin filters stay fast as
-- the table grows. The public listProductReviews filter (hidden =
-- false) is the dominant query path and benefits from the
-- productId index already in place; this is purely for the
-- admin-side "show only hidden" view.
CREATE INDEX "Review_hidden_idx" ON "Review"("hidden") WHERE "hidden" = true;
