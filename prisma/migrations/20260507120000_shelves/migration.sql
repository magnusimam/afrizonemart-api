-- Phase 10.8 — Shelf Manager.
-- One row per placement key, holding the container config (title,
-- rows × cols, enabled). Per-product membership stays in
-- ProductPlacement; Shelf only stores the wrapper.

CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 1,
    "cols" INTEGER NOT NULL DEFAULT 6,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shelf_key_key" ON "Shelf"("key");
