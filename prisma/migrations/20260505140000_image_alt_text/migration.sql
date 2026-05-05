-- Alt text for product images (SEO + accessibility).
ALTER TABLE "Product" ADD COLUMN "imageAlts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Per-image alt text on intern submissions. The 3 required slots
-- (front/back/side) get nullable text fields; extras get a parallel
-- array that mirrors `additionalImages` by index.
ALTER TABLE "ProductImageSubmission" ADD COLUMN "frontImageAlt" TEXT;
ALTER TABLE "ProductImageSubmission" ADD COLUMN "backImageAlt" TEXT;
ALTER TABLE "ProductImageSubmission" ADD COLUMN "sideImageAlt" TEXT;
ALTER TABLE "ProductImageSubmission" ADD COLUMN "additionalImageAlts" TEXT[] DEFAULT ARRAY[]::TEXT[];
