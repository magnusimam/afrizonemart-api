-- Add free-form jobTitle to User. Nullable, no default — existing users
-- come back as NULL until the admin sets one via the staff dialog.
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;

-- Repair (2026-08-08): the STAFF role and User.permissions[] reached the dev
-- database through `prisma db push` and were never captured in a migration.
-- A from-scratch `migrate deploy` therefore died at
-- 20260511150000_grant_interns_products_write ("column permissions does not
-- exist"). Backfilled here, the earliest User migration that precedes it.
-- Guarded so this is a no-op on any database that already has them.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
