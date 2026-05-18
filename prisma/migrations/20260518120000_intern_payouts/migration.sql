-- Tracker #50 — Intern image-work payouts (2026-05-18)
-- New InternPayout table + payoutId column on ProductImageSubmission.
-- See schema.prisma for the model commentary.

CREATE TABLE "InternPayout" (
    "id" TEXT NOT NULL,
    "internId" TEXT NOT NULL,
    "totalNgn" INTEGER NOT NULL,
    "submissionCount" INTEGER NOT NULL,
    "windowFrom" TIMESTAMP(3),
    "windowTo" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "InternPayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InternPayout_internId_paidAt_idx" ON "InternPayout"("internId", "paidAt");
CREATE INDEX "InternPayout_paidAt_idx" ON "InternPayout"("paidAt");

ALTER TABLE "InternPayout"
    ADD CONSTRAINT "InternPayout_internId_fkey"
    FOREIGN KEY ("internId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternPayout"
    ADD CONSTRAINT "InternPayout_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Submission → payout link. Nullable so existing approved submissions
-- remain "unpaid" by default; admin can either create a historical
-- backfill payout per intern or leave them as the visible backlog.
ALTER TABLE "ProductImageSubmission" ADD COLUMN "payoutId" TEXT;

ALTER TABLE "ProductImageSubmission"
    ADD CONSTRAINT "ProductImageSubmission_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "InternPayout"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Fast lookup of "approved, unpaid" submissions for an intern.
CREATE INDEX "ProductImageSubmission_internId_status_payoutId_idx"
    ON "ProductImageSubmission"("internId", "status", "payoutId");
