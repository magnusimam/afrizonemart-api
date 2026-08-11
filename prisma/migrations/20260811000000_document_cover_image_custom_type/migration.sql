-- Civic Library — cover image + manual "Other" document type (2026-08-11)

-- AlterEnum
-- Postgres requires enum value additions in a separate tx; runs cleanly
-- against an existing DB without locking the DocumentType column.
ALTER TYPE "DocumentType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "GovDocument" ADD COLUMN "customDocType" TEXT;
ALTER TABLE "GovDocument" ADD COLUMN "coverImageUrl" TEXT;

-- AlterTable
ALTER TABLE "DocumentSubmission" ADD COLUMN "customDocType" TEXT;
ALTER TABLE "DocumentSubmission" ADD COLUMN "coverImageUrl" TEXT;
