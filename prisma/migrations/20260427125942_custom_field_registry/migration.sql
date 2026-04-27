-- CreateEnum
CREATE TYPE "CustomFieldScope" AS ENUM ('PRODUCT', 'ORDER', 'USER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONGTEXT', 'NUMBER', 'BOOLEAN', 'URL', 'VIDEO', 'IMAGE', 'SELECT', 'JSON', 'RICHTEXT');

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "scope" "CustomFieldScope" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "options" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDef_scope_isActive_sortOrder_idx" ON "CustomFieldDef"("scope", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_scope_key_key" ON "CustomFieldDef"("scope", "key");
