-- Foundation for the supplier portal (10-stage onboarding pipeline).
-- See SUPPLIER_PORTAL_TRACKER.md for the full spec.

-- 1. Add SUPPLIER to the UserRole enum.
ALTER TYPE "UserRole" ADD VALUE 'SUPPLIER';

-- 2. Supplier model — paired 1:1 with a User where role=SUPPLIER.
CREATE TABLE "Supplier" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "companyName"          TEXT,
  "contactName"          TEXT,
  "contactPhone"         TEXT,
  "country"              TEXT,
  "address"              TEXT,
  "currentStage"         INTEGER NOT NULL DEFAULT 1,
  "maxStage"             INTEGER NOT NULL DEFAULT 10,
  "minimumPIQsRequired"  INTEGER NOT NULL DEFAULT 1,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");
CREATE INDEX "Supplier_currentStage_idx" ON "Supplier"("currentStage");

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
