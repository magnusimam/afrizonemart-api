-- Tracker #49 — Resend webhook intake. Captures open / click /
-- bounce / complaint signals so marketing + ML have a feedback
-- loop on every email we send.

-- 1. Denormalised summary fields on Notification --------------------
ALTER TABLE "Notification"
  ADD COLUMN "deliveredAt"    TIMESTAMP(3),
  ADD COLUMN "firstOpenedAt"  TIMESTAMP(3),
  ADD COLUMN "lastOpenedAt"   TIMESTAMP(3),
  ADD COLUMN "openCount"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstClickedAt" TIMESTAMP(3),
  ADD COLUMN "lastClickedAt"  TIMESTAMP(3),
  ADD COLUMN "clickCount"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bouncedAt"      TIMESTAMP(3),
  ADD COLUMN "bounceReason"   TEXT,
  ADD COLUMN "complainedAt"   TIMESTAMP(3);

CREATE INDEX "Notification_providerMessageId_idx"
  ON "Notification"("providerMessageId");

-- 2. EmailEvent enum + table ----------------------------------------
CREATE TYPE "EmailEventType" AS ENUM (
  'SENT',
  'DELIVERED',
  'DELIVERY_DELAYED',
  'OPENED',
  'CLICKED',
  'BOUNCED',
  'COMPLAINED'
);

CREATE TABLE "EmailEvent" (
  "id"                TEXT NOT NULL,
  "notificationId"    TEXT,
  "providerMessageId" TEXT NOT NULL,
  "type"              "EmailEventType" NOT NULL,
  "occurredAt"        TIMESTAMP(3) NOT NULL,
  "clickedUrl"        TEXT,
  "bounceType"        TEXT,
  "bounceReason"      TEXT,
  "rawPayload"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailEvent_providerMessageId_idx" ON "EmailEvent"("providerMessageId");
CREATE INDEX "EmailEvent_notificationId_idx"   ON "EmailEvent"("notificationId");
CREATE INDEX "EmailEvent_type_occurredAt_idx"  ON "EmailEvent"("type", "occurredAt");

ALTER TABLE "EmailEvent"
  ADD CONSTRAINT "EmailEvent_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
