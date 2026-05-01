-- AlterTable: add self-relation parentId for category tree (subcategories)
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;

-- Index on parent for fast child lookups
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- Self-referential FK; if a parent is deleted, children become top-level
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
