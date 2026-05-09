-- Phase 12 — saved customer delivery addresses for /account/addresses
-- and the checkout shipping picker.

CREATE TABLE "UserAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAddress_userId_idx" ON "UserAddress"("userId");

CREATE INDEX "UserAddress_userId_isDefault_idx"
  ON "UserAddress"("userId", "isDefault");

ALTER TABLE "UserAddress"
  ADD CONSTRAINT "UserAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
