-- Brand / company logo per product. Captured by the intern image-update
-- workflow, surfaced on the product page "About the brand" section.
ALTER TABLE "Product" ADD COLUMN "brandImageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "brandImageAlt" TEXT;

-- Same fields on the submission so admin can review before publish.
ALTER TABLE "ProductImageSubmission" ADD COLUMN "brandImageUrl" TEXT;
ALTER TABLE "ProductImageSubmission" ADD COLUMN "brandImageAlt" TEXT;
