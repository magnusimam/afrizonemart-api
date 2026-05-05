-- "Supplier Discovery & Initial Contact" was removed from the supplier-
-- facing journey. The journey is now 9 stages (EoI through Engagement).
-- Discovery still happens internally as an AZM-side concept.

-- 1. Lower the default for new Supplier rows from 10 to 9.
ALTER TABLE "Supplier" ALTER COLUMN "maxStage" SET DEFAULT 9;

-- 2. Update existing rows from the old 10-stage layout to the new 9-stage one.
--
--    Old → New stage mapping:
--      1 (Discovery)    → 1 (EoI)         — anyone still at Discovery wasn't seeing it; bring them in to EoI
--      2 (EoI)          → 1 (EoI)
--      3 (Profile)      → 2 (Profile)
--      4 (PIQ)          → 3 (PIQ)
--      5 (Orientation)  → 4 (Orientation)
--      6 (Audit)        → 5 (Audit)
--      7 (Partnership)  → 6 (Partnership)
--      8 (Activation)   → 7 (Activation)
--      9 (Trade)        → 8 (Trade)
--      10 (Engagement)  → 9 (Engagement)
UPDATE "Supplier" SET "currentStage" = GREATEST(1, "currentStage" - 1) WHERE "maxStage" = 10;
UPDATE "Supplier" SET "maxStage" = 9 WHERE "maxStage" = 10;
