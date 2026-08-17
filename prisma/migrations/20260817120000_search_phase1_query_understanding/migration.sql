-- Search & Discovery Phase 1 — Query Understanding (2026-08-17)
-- Diacritic folding (unaccent), latency/script logging columns on
-- SearchQueryLog, and the seed synonym dictionary. See
-- ALGORITHM_SYSTEMS_TRACKER.md, "Search ranking & relevance" ->
-- Phase 1 sub-checklist.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `unaccent()` is STABLE, not IMMUTABLE (it depends on a dictionary
-- lookup), so Postgres refuses to use it directly inside a GENERATED
-- ALWAYS column expression or an index expression. This wrapper is the
-- standard accepted workaround: pin the dictionary explicitly by name
-- and declare it IMMUTABLE. It's a small, disclosed lie (the 'unaccent'
-- text search dictionary could theoretically be redefined), acceptable
-- because we control the DB and never touch that dictionary.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Rebuild "Product"."searchVector" with accent folding on every field.
-- Generated columns can't have their expression altered in place —
-- drop + re-add triggers a full-table recompute (1,749 rows as of
-- 2026-08-17; trivial cost). Field weights (name=A/brand=B/
-- shortDescription=C/description=D) and 'simple' config unchanged
-- from Phase 0 — this migration only adds accent folding.
DROP INDEX IF EXISTS "Product_searchVector_idx";
ALTER TABLE "Product" DROP COLUMN "searchVector";
ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce("brand", ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce("shortDescription", ''))), 'C') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce("description", ''))), 'D')
  ) STORED;
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");

-- AlterTable: SearchQueryLog gets latency + script-classification
-- columns (Phase 1 "p95 baseline" and "language detection" checklist
-- items — see model doc comment in schema.prisma for the language ->
-- script substitution rationale).
ALTER TABLE "SearchQueryLog" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "SearchQueryLog" ADD COLUMN "script" TEXT;
ALTER TABLE "SearchQueryLog" ADD COLUMN "usedFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SearchQueryLog" ADD COLUMN "didYouMeanShown" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: seed synonym dictionary (Phase 1 "seed synonym
-- dictionary" checklist item).
CREATE TABLE "SearchSynonym" (
    "id" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "terms" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchSynonym_terms_idx" ON "SearchSynonym" USING GIN ("terms");

-- Seed starter groups: British/American spelling pairs and
-- local/alternate names common on an African grocery + lifestyle
-- marketplace. Hand-picked, not mined — Phase 2+ can grow this from
-- SearchQueryLog reformulation patterns once there's real volume.
INSERT INTO "SearchSynonym" ("id", "canonical", "terms", "updatedAt") VALUES
  ('seed_syn_garri',      'garri',      ARRAY['garri','gari'], CURRENT_TIMESTAMP),
  ('seed_syn_eggplant',   'eggplant',   ARRAY['eggplant','aubergine','garden egg'], CURRENT_TIMESTAMP),
  ('seed_syn_zucchini',   'zucchini',   ARRAY['zucchini','courgette'], CURRENT_TIMESTAMP),
  ('seed_syn_chili',      'chili',      ARRAY['chili','chilli','pepper'], CURRENT_TIMESTAMP),
  ('seed_syn_cookie',     'cookie',     ARRAY['cookie','biscuit'], CURRENT_TIMESTAMP),
  ('seed_syn_diaper',     'diaper',     ARRAY['diaper','nappy'], CURRENT_TIMESTAMP),
  ('seed_syn_sneakers',   'sneakers',   ARRAY['sneakers','trainers'], CURRENT_TIMESTAMP),
  ('seed_syn_flashlight', 'flashlight', ARRAY['flashlight','torch'], CURRENT_TIMESTAMP),
  ('seed_syn_pants',      'pants',      ARRAY['pants','trousers'], CURRENT_TIMESTAMP),
  ('seed_syn_stove',      'stove',      ARRAY['stove','cooker'], CURRENT_TIMESTAMP),
  ('seed_syn_faucet',     'faucet',     ARRAY['faucet','tap'], CURRENT_TIMESTAMP),
  ('seed_syn_closet',     'closet',     ARRAY['closet','wardrobe'], CURRENT_TIMESTAMP),
  ('seed_syn_stroller',   'stroller',   ARRAY['stroller','pram','pushchair'], CURRENT_TIMESTAMP),
  ('seed_syn_soda',       'soda',       ARRAY['soda','soft drink','pop','minerals'], CURRENT_TIMESTAMP),
  ('seed_syn_yam_flour',  'yam flour',  ARRAY['yam flour','elubo'], CURRENT_TIMESTAMP),
  ('seed_syn_okra',       'okra',       ARRAY['okra','okro'], CURRENT_TIMESTAMP),
  ('seed_syn_plantain',   'plantain',   ARRAY['plantain','dodo'], CURRENT_TIMESTAMP),
  ('seed_syn_beans',      'beans',      ARRAY['beans','ewa'], CURRENT_TIMESTAMP),
  ('seed_syn_cornmeal',   'cornmeal',   ARRAY['cornmeal','maize meal','pap','ogi'], CURRENT_TIMESTAMP),
  ('seed_syn_headwrap',   'headwrap',   ARRAY['headwrap','gele','headtie'], CURRENT_TIMESTAMP);
