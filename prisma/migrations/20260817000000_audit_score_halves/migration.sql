-- The indicative score carries halves, and an integer column cannot hold one.
--
-- The published methodology is
--     score = 100 - SUM(major points) - (0.5 x minor count)
-- so any audit with an odd number of Minor findings lands on a half. Oluwatoyin
-- Integrated Farms' shipped report scores 94.5/100; stored as an integer that
-- becomes 95, and the report no longer agrees with the record behind it.
--
-- DOUBLE PRECISION rather than NUMERIC deliberately. Scores are constrained to
-- whole numbers and halves, and 0.5 is exactly representable in binary floating
-- point -- there is no drift to guard against here. NUMERIC would be equally
-- correct but maps to a Decimal object in the Prisma client rather than a
-- number, which would ripple .toNumber() calls through every caller that reads
-- this column for an email, a dashboard or a trade gate.
--
-- Widening is lossless: every existing integer score survives unchanged. The
-- historical values remain rounded, because the true half was lost when they
-- were first written and cannot be recovered from the stored score alone.
ALTER TABLE "SupplierAudit"
  ALTER COLUMN "indicativeScore" TYPE DOUBLE PRECISION;


-- The resolved checklist, snapshotted onto the audit.
--
-- Which checkpoints a supplier is assessed against is derived from their
-- product profile, so it has to be frozen at the moment the checklist is
-- issued. When a report is challenged months later we must be able to show the
-- checklist that was actually used, the catalogue version in force, and why
-- each checkpoint was on it -- not what the same inputs would produce against a
-- catalogue that has since been edited.
--
-- "assessmentProfile" is the fact set the resolution was computed from, stored
-- alongside for the same reason: a supplier editing their profile afterwards
-- must not retroactively change a completed audit.
ALTER TABLE "SupplierAudit"
  ADD COLUMN "protocolCode"      TEXT,
  ADD COLUMN "protocolVersion"   TEXT,
  ADD COLUMN "checklistSnapshot" JSONB,
  ADD COLUMN "assessmentProfile" JSONB;

CREATE INDEX "SupplierAudit_protocolCode_idx" ON "SupplierAudit"("protocolCode");


-- Short code for the report's document number. Stored, never derived: the
-- shipped reports are inconsistent about it (Eden Foods -> EDEN, but
-- Oluwatoyin Integrated Farms -> ZAO), so no derivation rule reproduces them.
ALTER TABLE "SupplierAudit" ADD COLUMN "reportSlug" TEXT;
