-- AlterTable
ALTER TABLE "calendar_connections" ADD COLUMN "syncToken" TEXT,
ADD COLUMN "fullSyncedAt" TIMESTAMPTZ(3),
ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3);
