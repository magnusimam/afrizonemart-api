-- AlterTable
ALTER TABLE "SupplierAudit" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "signedBy" TEXT;

-- CreateIndex
CREATE INDEX "SupplierAudit_approvedAt_idx" ON "SupplierAudit"("approvedAt");

-- AddForeignKey
ALTER TABLE "SupplierAudit" ADD CONSTRAINT "SupplierAudit_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: audits completed BEFORE the sign-off gate existed were already
-- released to their supplier (the old completeAudit sent the report email
-- immediately). Without this they would silently disappear from
-- GET /me/audit, which now requires "approvedAt". Attribute the retroactive
-- authorisation to the auditor already recorded on the audit, dated to when
-- it was conducted -- inventing a new approval date would misrepresent the
-- audit trail.
UPDATE "SupplierAudit"
SET "approvedAt" = COALESCE("conductedAt", "updatedAt"),
    "signedBy"   = "auditorName"
WHERE "status" = 'COMPLETED' AND "approvedAt" IS NULL;
