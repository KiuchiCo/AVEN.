CREATE TABLE "activity_receipts" (
    "id" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "dismissedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activity_receipts_activityId_userId_key" ON "activity_receipts"("activityId", "userId");
CREATE INDEX "activity_receipts_userId_readAt_dismissedAt_idx" ON "activity_receipts"("userId", "readAt", "dismissedAt");

ALTER TABLE "activity_receipts" ADD CONSTRAINT "activity_receipts_activityId_fkey"
FOREIGN KEY ("activityId") REFERENCES "workspace_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_receipts" ADD CONSTRAINT "activity_receipts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
