-- Brand / company logo per product. Captured by the intern image-update
-- workflow, surfaced on the product page "About the brand" section.
ALTER TABLE "Product" ADD COLUMN "brandImageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "brandImageAlt" TEXT;

-- Create missing enum + table (creation migration was lost from history).
CREATE TYPE "ImageSubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "ProductImageSubmission" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "status" "ImageSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "frontImageUrl" TEXT,
    "backImageUrl" TEXT,
    "sideImageUrl" TEXT,
    "additionalImages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "brandImageUrl" TEXT,
    "brandImageAlt" TEXT,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductImageSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductImageSubmission_internId_status_idx" ON "ProductImageSubmission"("internId", "status");
CREATE INDEX "ProductImageSubmission_productId_idx" ON "ProductImageSubmission"("productId");
CREATE INDEX "ProductImageSubmission_status_createdAt_idx" ON "ProductImageSubmission"("status", "createdAt");
-- Repair (2026-08-08): "payoutId" (column + index) belongs to
-- 20260518120000_intern_payouts. Recreating it here made that later
-- migration fail on a fresh database with "column already exists", so the
-- table is created in its true historical shape and intern_payouts adds it.

ALTER TABLE "ProductImageSubmission" ADD CONSTRAINT "ProductImageSubmission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImageSubmission" ADD CONSTRAINT "ProductImageSubmission_internId_fkey" FOREIGN KEY ("internId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImageSubmission" ADD CONSTRAINT "ProductImageSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
