-- Tracker #48 — marketing + SMS consent flags on User.
-- Existing users are NOT grandfathered into opt-in — we default to
-- false on every row, including legacy. Customer opts in explicitly
-- via signup checkbox / /account/profile / re-opt-in link.

ALTER TABLE "User" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;
