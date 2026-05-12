-- Continental Rewards — Afrizone Coin loyalty program (Tracker #44 PR 1).
-- Schema-only PR. Admin can configure the program + inspect accounts;
-- enrollment + earn (PR 2), redemption (PR 3), expiry + clawback (PR 4)
-- ship in subsequent migrations.

CREATE TYPE "LoyaltyTier" AS ENUM (
  'BLUE',
  'GOLD',
  'VIP',
  'AMBASSADOR',
  'DORIME'
);

CREATE TYPE "LoyaltyTransactionType" AS ENUM (
  'WELCOME_BONUS',
  'EARN',
  'REDEEM',
  'REFUND_REVERSAL',
  'REDEEM_REFUND',
  'EXPIRY',
  'ADMIN_ADJUSTMENT'
);

CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coinBalance" INTEGER NOT NULL DEFAULT 0,
    "currentTier" "LoyaltyTier" NOT NULL DEFAULT 'BLUE',
    "lifetimeCoinsEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeCoinsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyAccount_userId_key" ON "LoyaltyAccount"("userId");
CREATE INDEX "LoyaltyAccount_currentTier_idx" ON "LoyaltyAccount"("currentTier");

ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "LoyaltyAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "causeOrderId" TEXT,
    "causeAdminId" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoyaltyTransaction_accountId_createdAt_idx"
  ON "LoyaltyTransaction"("accountId", "createdAt");
CREATE INDEX "LoyaltyTransaction_accountId_type_expiresAt_idx"
  ON "LoyaltyTransaction"("accountId", "type", "expiresAt");
CREATE INDEX "LoyaltyTransaction_causeOrderId_idx"
  ON "LoyaltyTransaction"("causeOrderId");

ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoyaltyConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "baseEarnPerOrder" INTEGER NOT NULL DEFAULT 5,
    "tierMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "welcomeBonusCoins" INTEGER NOT NULL DEFAULT 20,
    "tier2GoldThreshold" INTEGER NOT NULL DEFAULT 80000,
    "tier3VipThreshold" INTEGER NOT NULL DEFAULT 500000,
    "tier4AmbassadorThreshold" INTEGER NOT NULL DEFAULT 1000000,
    "tier5DorimeThreshold" INTEGER NOT NULL DEFAULT 10000000,
    "coinValueNgn" INTEGER NOT NULL DEFAULT 33,
    "maxOrderRedeemPercent" INTEGER NOT NULL DEFAULT 50,
    "minRedeemCoins" INTEGER NOT NULL DEFAULT 30,
    "coinExpiryMonths" INTEGER NOT NULL DEFAULT 2,
    "spendWindowMonths" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "LoyaltyConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton config row on first migrate. Subsequent runs
-- of this migration won't re-run; ON CONFLICT defends against the
-- "table already partially populated" corner case.
INSERT INTO "LoyaltyConfig" (id, "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
  ON CONFLICT (id) DO NOTHING;
