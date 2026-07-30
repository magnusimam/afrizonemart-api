-- Civic Library — free government document downloads (2026-07-30)
-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONSTITUTION', 'ACT', 'BILL', 'POLICY', 'REGULATION', 'TREATY');
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "GovDocument" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "description" TEXT,
    "issuingBody" TEXT,
    "officialSourceUrl" TEXT,
    "publishedDate" TIMESTAMP(3),
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSubmission" (
    "id" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "status" "ImageSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "description" TEXT,
    "issuingBody" TEXT,
    "officialSourceUrl" TEXT,
    "publishedDate" TIMESTAMP(3),
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdDocumentId" TEXT,
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GovDocument_slug_key" ON "GovDocument"("slug");
CREATE INDEX "GovDocument_country_idx" ON "GovDocument"("country");
CREATE INDEX "GovDocument_docType_idx" ON "GovDocument"("docType");
CREATE INDEX "GovDocument_status_idx" ON "GovDocument"("status");

CREATE INDEX "DocumentSubmission_internId_status_idx" ON "DocumentSubmission"("internId", "status");
CREATE INDEX "DocumentSubmission_status_createdAt_idx" ON "DocumentSubmission"("status", "createdAt");
CREATE INDEX "DocumentSubmission_internId_status_payoutId_idx" ON "DocumentSubmission"("internId", "status", "payoutId");

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_internId_fkey" FOREIGN KEY ("internId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "InternPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
