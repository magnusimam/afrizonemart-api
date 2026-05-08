-- Phase 11.3 (audit M7) — per-account login lockout counters.

ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3);
