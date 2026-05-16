-- 2026-05-16 — Phase 2 Continental Rewards gamification.
--
-- Tier protection (no auto-downgrade), birthday bonus, referral
-- system, weekend earn boost, tier-gated coupons. See the
-- ARCHITECTURE_TRACKER.md entry for the design + Magnus' redlines.

-- 1. User: birthday + referral attribution -------------------------

ALTER TABLE "User"
  ADD COLUMN "birthDate"        TIMESTAMP(3),
  ADD COLUMN "referralCode"     TEXT,
  ADD COLUMN "referredByUserId" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_referredByUserId_fkey"
  FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. LoyaltyAccount: tier protection -------------------------------

ALTER TABLE "LoyaltyAccount"
  ADD COLUMN "tierProtected"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastDowngradedAt" TIMESTAMP(3);

-- Existing accounts above BLUE are protected retroactively — Magnus'
-- explicit rule: nobody loses their tier passively. New accounts
-- earn protection by climbing.
UPDATE "LoyaltyAccount"
SET    "tierProtected" = true
WHERE  "currentTier" != 'BLUE';

-- 3. Coupon: tier-gated discounts ----------------------------------

ALTER TABLE "Coupon" ADD COLUMN "requiredTier" "LoyaltyTier";

-- 4. LoyaltyConfig: new perk + referral knobs ----------------------

ALTER TABLE "LoyaltyConfig"
  ADD COLUMN "birthdayBonusBlue"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "birthdayBonusGold"        INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "birthdayBonusVip"         INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "birthdayBonusAmbassador"  INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "birthdayBonusDorime"      INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "weekendEarnMultiplier"    DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  ADD COLUMN "weekendBoostTiers"        "LoyaltyTier"[] NOT NULL DEFAULT ARRAY['VIP','AMBASSADOR','DORIME']::"LoyaltyTier"[],
  ADD COLUMN "maxReferralsPerMonth"     INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "referralCapBlue"          INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "referralCapGold"          INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "referralCapVip"           INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "referralCapAmbassador"    INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "referralCapDorime"        INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "referralPercent"          INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "referralHoldDays"         INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "refereeCouponValidDays"   INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "refereeCouponNgn"         INTEGER NOT NULL DEFAULT 500;

-- 5. Referral table ------------------------------------------------

CREATE TYPE "ReferralStatus" AS ENUM (
  'PENDING',
  'PAYOUT_SCHEDULED',
  'PAID_OUT',
  'REVERSED'
);

CREATE TABLE "Referral" (
  "id"                   TEXT NOT NULL,
  "referrerUserId"       TEXT NOT NULL,
  "refereeUserId"        TEXT NOT NULL,
  "referralCode"         TEXT NOT NULL,
  "status"               "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "firstPaidOrderId"     TEXT,
  "firstPaidOrderAt"     TIMESTAMP(3),
  "scheduledCoinPayout"  INTEGER,
  "scheduledPayoutAt"    TIMESTAMP(3),
  "paidOutAt"            TIMESTAMP(3),
  "payoutTransactionId"  TEXT,
  "reversedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Referral_refereeUserId_key" ON "Referral"("refereeUserId");
CREATE INDEX "Referral_referrerUserId_status_idx" ON "Referral"("referrerUserId", "status");
CREATE INDEX "Referral_scheduledPayoutAt_idx" ON "Referral"("scheduledPayoutAt");
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_referrerUserId_fkey"
  FOREIGN KEY ("referrerUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral"
  ADD CONSTRAINT "Referral_refereeUserId_fkey"
  FOREIGN KEY ("refereeUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Backfill referralCode for existing users ----------------------
-- Each existing user gets a stable slug derived from their cuid so
-- they can share a link the moment Phase 2 deploys, without waiting
-- to log in. We hash 8 chars of the id; collisions are astronomically
-- unlikely at our user count and the unique index protects either way.
UPDATE "User"
SET "referralCode" = lower(substr(encode(sha256(("id" || '::ref')::bytea), 'hex'), 1, 10))
WHERE "referralCode" IS NULL;
