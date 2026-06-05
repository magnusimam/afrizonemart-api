-- AlterTable
ALTER TABLE "Review" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- AddForeignKey
-- SetNull on user delete so the review row + text remain (other
-- shoppers benefit from the review content) but identifiability is
-- severed when an account is deleted. The account-deletion service
-- additionally sets authorName to "Anonymous reviewer" for any rows
-- with this user's id, so the FK SET NULL is a safety net only.
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Partial unique index: one review per (user, product) pair, but
-- only when userId is not null. Historical rows from before this
-- column existed have userId NULL and are excluded from the
-- uniqueness constraint, so the migration applies cleanly to the
-- existing dataset.
CREATE UNIQUE INDEX "Review_userId_productId_unique"
  ON "Review"("userId", "productId")
  WHERE "userId" IS NOT NULL;
