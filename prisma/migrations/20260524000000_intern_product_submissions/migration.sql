-- CreateTable: full-product intern submissions (2026-05-24)
CREATE TABLE "ProductSubmission" (
    "id" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "status" "ImageSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT,
    "shortDescription" TEXT,
    "description" TEXT,
    "ingredients" TEXT,
    "price" INTEGER NOT NULL,
    "comparePrice" INTEGER,
    "origin" TEXT,
    "weightKg" DOUBLE PRECISION,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "categorySlug" TEXT,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdProductId" TEXT,
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSubmission_internId_status_idx" ON "ProductSubmission"("internId", "status");
CREATE INDEX "ProductSubmission_status_createdAt_idx" ON "ProductSubmission"("status", "createdAt");
CREATE INDEX "ProductSubmission_internId_status_payoutId_idx" ON "ProductSubmission"("internId", "status", "payoutId");

-- AddForeignKey
ALTER TABLE "ProductSubmission" ADD CONSTRAINT "ProductSubmission_internId_fkey" FOREIGN KEY ("internId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSubmission" ADD CONSTRAINT "ProductSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductSubmission" ADD CONSTRAINT "ProductSubmission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "InternPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
