-- The issued report document, for audits whose report exists as a file.
-- The first cohort of diagnostic reports was written in Word before the portal
-- could generate them; the supplier must be able to read exactly the document
-- that was signed rather than a re-render of it.
ALTER TABLE "SupplierAudit" ADD COLUMN "reportFileUrl" TEXT;
ALTER TABLE "SupplierAudit" ADD COLUMN "reportFileName" TEXT;
ALTER TABLE "SupplierAudit" ADD COLUMN "reportFileType" TEXT;
