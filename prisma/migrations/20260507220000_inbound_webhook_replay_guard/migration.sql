-- Phase 11.3 (audit H3) — inbound-webhook replay guard.

CREATE TABLE "InboundWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookEvent_provider_bodyHash_key"
  ON "InboundWebhookEvent"("provider", "bodyHash");

CREATE INDEX "InboundWebhookEvent_receivedAt_idx"
  ON "InboundWebhookEvent"("receivedAt");
