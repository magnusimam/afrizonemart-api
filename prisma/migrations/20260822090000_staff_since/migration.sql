-- Distinguishes "when did this account become staff" from `createdAt`,
-- which for anyone promoted from an existing customer account (the
-- createStaff CUSTOMER_EXISTS flow) is their original shopper signup
-- date. Surfaced 2026-08-22 by an intern (Fega) whose admin "Joined"
-- date showed her May customer signup, not her actual August start.

ALTER TABLE "User" ADD COLUMN "staffSince" TIMESTAMP(3);

-- Backfill: earliest recorded staff activity (image/product/document
-- submission) for anyone currently STAFF/ADMIN/SELLER, falling back to
-- createdAt when there's no activity on record (accounts created
-- directly as staff, or staff who never submitted anything).
UPDATE "User" u
SET "staffSince" = COALESCE(
  (
    SELECT MIN(t."createdAt") FROM (
      SELECT "createdAt" FROM "ProductImageSubmission" WHERE "internId" = u.id
      UNION ALL
      SELECT "createdAt" FROM "ProductSubmission" WHERE "internId" = u.id
      UNION ALL
      SELECT "createdAt" FROM "DocumentSubmission" WHERE "internId" = u.id
    ) t
  ),
  u."createdAt"
)
WHERE u.role IN ('STAFF', 'ADMIN', 'SELLER');
