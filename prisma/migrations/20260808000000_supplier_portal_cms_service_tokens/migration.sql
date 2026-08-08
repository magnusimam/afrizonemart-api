-- Supplier portal + CMS/blog + service tokens.
--
-- These models reached both the dev and production databases through
-- `prisma db push` and were never captured as a migration, so the schema and
-- the migration history had drifted apart. This migration closes that gap.
--
-- Every statement is idempotent on purpose. Production already has the CMS,
-- blog and service-token tables (`/api/blog` and `/api/pages` answer 200
-- there) but none of the supplier tables, while a fresh database has neither.
-- railway.toml runs `prisma migrate deploy && node dist/server.js`, so a
-- single "already exists" error here would stop the API from starting at all.
--
-- Tables: Page, PageSection, PageRevision, BlogPost, MediaAsset, ServiceToken,
-- SupplierProfile, ProductPIQ, FacilityVisit, SupplierAudit, ReviewCall,
-- OrientationComment, PurchaseOrder.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "POStatus" AS ENUM ('ISSUED', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ReviewCallStatus" AS ENUM ('PENDING', 'SCHEDULED', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FacilityVisitStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditStatus" AS ENUM ('DRAFT', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditOutcome" AS ENUM ('APPROVED', 'PROVISIONAL', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PIQStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REVISION_REQUIRED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "Order_deliveryOtp_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "assignedInternId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PageSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "headline" TEXT,
    "subheadline" TEXT,
    "accentColor" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "draftConfig" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "authorId" TEXT,
    "authorEmail" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "heroImage" TEXT,
    "heroImageAlt" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readingTimeMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "category" TEXT NOT NULL,
    "currentStage" INTEGER NOT NULL DEFAULT 1,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "legalName" TEXT,
    "regNumber" TEXT,
    "taxId" TEXT,
    "yearEstablished" INTEGER,
    "employees" INTEGER,
    "factoryType" TEXT,
    "factoryAddress" TEXT,
    "businessLicenseUrl" TEXT,
    "eoiAnswers" JSONB,
    "stageAnswers" JSONB,
    "cluster" TEXT,
    "source" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'ISSUED',
    "items" JSONB NOT NULL DEFAULT '[]',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewCall" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "ReviewCallStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "meetingMode" TEXT,
    "meetingLink" TEXT,
    "notes" TEXT,
    "proposedAt" TIMESTAMP(3),
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrientationComment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "atSeconds" INTEGER,
    "isQuestion" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrientationComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FacilityVisit" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "FacilityVisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "preferredDate" TEXT,
    "address" TEXT,
    "contactPhone" TEXT,
    "confirmedDate" TIMESTAMP(3),
    "confirmedWindow" TEXT,
    "leadName" TEXT,
    "leadPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierAudit" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "metadata" JSONB,
    "preVisitDocs" JSONB,
    "responses" JSONB,
    "capa" JSONB,
    "indicativeScore" INTEGER,
    "counts" JSONB,
    "outcome" "AuditOutcome",
    "summary" TEXT,
    "recommendations" TEXT,
    "auditorName" TEXT,
    "conductedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductPIQ" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "status" "PIQStatus" NOT NULL DEFAULT 'DRAFT',
    "completion" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "reviewSummary" TEXT,
    "feedback" JSONB,
    "source" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPIQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PageSection_pageId_position_idx" ON "PageSection"("pageId", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PageRevision_pageId_createdAt_idx" ON "PageRevision"("pageId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_url_key" ON "MediaAsset"("url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogPost_slug_idx" ON "BlogPost"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProfile_userId_key" ON "SupplierProfile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierProfile_userId_idx" ON "SupplierProfile"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierProfile_status_idx" ON "SupplierProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewCall_supplierId_key" ON "ReviewCall"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewCall_status_idx" ON "ReviewCall"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrientationComment_supplierId_idx" ON "OrientationComment"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrientationComment_createdAt_idx" ON "OrientationComment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FacilityVisit_supplierId_key" ON "FacilityVisit"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FacilityVisit_status_idx" ON "FacilityVisit"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierAudit_supplierId_key" ON "SupplierAudit"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierAudit_status_idx" ON "SupplierAudit"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductPIQ_supplierId_idx" ON "ProductPIQ"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductPIQ_status_idx" ON "ProductPIQ"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceToken_name_key" ON "ServiceToken"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceToken_tokenHash_key" ON "ServiceToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ServiceToken_revokedAt_idx" ON "ServiceToken"("revokedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_assignedInternId_idx" ON "Product"("assignedInternId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_assignedInternId_fkey" FOREIGN KEY ("assignedInternId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PageSection" ADD CONSTRAINT "PageSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ReviewCall" ADD CONSTRAINT "ReviewCall_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OrientationComment" ADD CONSTRAINT "OrientationComment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FacilityVisit" ADD CONSTRAINT "FacilityVisit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SupplierAudit" ADD CONSTRAINT "SupplierAudit_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProductPIQ" ADD CONSTRAINT "ProductPIQ_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplierProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
