-- Phase 10.8b — country-rule shelves.
-- When `countryRows` is set, the shelf renders from the rules instead
-- of explicit picks. Format:
--   [{ "country": "ZA", "count": 6 }, { "country": "NG", "count": 6 }]
-- A null/missing country means "any country".

ALTER TABLE "Shelf" ADD COLUMN "countryRows" JSONB;
