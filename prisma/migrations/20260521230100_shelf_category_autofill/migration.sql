-- Phase 11 — category auto-fill on Shelf. Scalable pattern for
-- category-themed shelves (Mobile Home rebuild).
ALTER TABLE "Shelf"
  ADD COLUMN "categoryAutoFill" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
