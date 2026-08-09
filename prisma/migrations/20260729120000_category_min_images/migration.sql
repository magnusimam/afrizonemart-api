-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "minImages" INTEGER NOT NULL DEFAULT 3;

-- Books are complete with just a cover image; every other category
-- keeps the physical-product default of 3 (front/back/side).
WITH RECURSIVE book_tree AS (
  SELECT id FROM "Category" WHERE slug = 'books'
  UNION ALL
  SELECT c.id FROM "Category" c JOIN book_tree bt ON c."parentId" = bt.id
)
UPDATE "Category" SET "minImages" = 1 WHERE id IN (SELECT id FROM book_tree);
