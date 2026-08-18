-- On-site facility visit form, matched to the supplier's product category.
-- Its results seed the product audit (SupplierAudit.preVisitDocs + category).

-- AlterTable
ALTER TABLE "FacilityVisit" ADD COLUMN     "formCategory" TEXT,
ADD COLUMN     "docsSighted" JSONB,
ADD COLUMN     "observations" JSONB,
ADD COLUMN     "visitSummary" TEXT,
ADD COLUMN     "formSubmittedAt" TIMESTAMP(3);
