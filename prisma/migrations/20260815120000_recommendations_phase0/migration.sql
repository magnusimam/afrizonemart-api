-- Recommendations & Personalization Phase 0
-- Impression/click log table — see prisma/schema.prisma RecommendationImpression
-- and Afrizonemart_Recommendations_Personalization_Design_Spec.docx Section 16.3.
--
-- NOTE: this migration was hand-written from a `prisma migrate diff` against
-- prod, keeping ONLY the statements for the new table. The raw diff also
-- included unrelated DROP INDEX / ALTER COLUMN statements caused by
-- pre-existing prod/schema drift (orphaned imageAlts columns, search index
-- declarations Prisma can't introspect — see
-- project_prod_db_orphaned_columns.md, unresolved, out of scope here) which
-- must NOT be applied by this migration.

-- CreateTable
CREATE TABLE "RecommendationImpression" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "seedProductId" TEXT,
    "productIds" TEXT[],
    "userId" TEXT,
    "sessionId" TEXT,
    "country" TEXT,
    "clickedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationImpression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationImpression_module_createdAt_idx" ON "RecommendationImpression"("module", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationImpression_userId_createdAt_idx" ON "RecommendationImpression"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationImpression_seedProductId_createdAt_idx" ON "RecommendationImpression"("seedProductId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecommendationImpression" ADD CONSTRAINT "RecommendationImpression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
