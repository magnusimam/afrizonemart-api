-- Some products don't have a clear front/back/side (flat items, small
-- bottles, etc.). Letting those submissions proceed with whatever
-- images the intern has, instead of forcing them to upload duplicates.
-- The "at least one image" rule moves into the zod submit schema.

ALTER TABLE "ProductImageSubmission" ALTER COLUMN "frontImageUrl" DROP NOT NULL;
ALTER TABLE "ProductImageSubmission" ALTER COLUMN "backImageUrl" DROP NOT NULL;
ALTER TABLE "ProductImageSubmission" ALTER COLUMN "sideImageUrl" DROP NOT NULL;
