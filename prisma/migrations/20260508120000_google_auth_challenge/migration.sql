-- Phase 11.3 (audit H7) — Google sign-in anti-replay nonce.

CREATE TABLE "GoogleAuthChallenge" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "GoogleAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAuthChallenge_nonce_key"
  ON "GoogleAuthChallenge"("nonce");

CREATE INDEX "GoogleAuthChallenge_expiresAt_idx"
  ON "GoogleAuthChallenge"("expiresAt");
