-- Search & Discovery Phase 0 — Foundation (2026-08-11)
-- Postgres-native lexical search: a generated tsvector column
-- (DB-maintained on every INSERT/UPDATE, no app-level sync needed)
-- plus a GIN index for BM25-style ranking via ts_rank_cd(), and
-- pg_trgm for typo-tolerant fallback matching + autocomplete.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable: generated full-text column, field-weighted
-- name=A, brand=B, shortDescription=C, description=D.
-- 'simple' config deliberately — the catalogue is multilingual and
-- English stemming would mismatch non-English listings. Upgrading to
-- per-language analyzers is Phase 1 work (see
-- ALGORITHM_SYSTEMS_TRACKER.md).
ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("shortDescription", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'D')
  ) STORED;

-- CreateIndex
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- CreateIndex: trigram index for fuzzy/typo-tolerant matching
-- (zero-result recovery + autocomplete product jumps).
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateTable
CREATE TABLE "SearchQueryLog" (
    "id" TEXT NOT NULL,
    "rawQuery" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "country" TEXT,
    "clickedProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchQueryLog_normalizedQuery_createdAt_idx" ON "SearchQueryLog"("normalizedQuery", "createdAt");
CREATE INDEX "SearchQueryLog_userId_createdAt_idx" ON "SearchQueryLog"("userId", "createdAt");
CREATE INDEX "SearchQueryLog_resultCount_createdAt_idx" ON "SearchQueryLog"("resultCount", "createdAt");

-- AddForeignKey
ALTER TABLE "SearchQueryLog" ADD CONSTRAINT "SearchQueryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
