-- AlterTable
ALTER TABLE "User" ADD COLUMN "wrapOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WrappedSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WrappedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrappedSnapshot_userId_year_key" ON "WrappedSnapshot"("userId", "year");

-- CreateIndex
-- Drives the annual publish cron: "find every snapshot for year 2026
-- where publishedAt is null + visible is true". Partial index keeps
-- the lookup fast as the table grows year over year.
CREATE INDEX "WrappedSnapshot_year_publishedAt_idx" ON "WrappedSnapshot"("year", "publishedAt");

-- AddForeignKey
ALTER TABLE "WrappedSnapshot" ADD CONSTRAINT "WrappedSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
