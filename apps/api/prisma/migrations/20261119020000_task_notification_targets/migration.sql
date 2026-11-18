ALTER TABLE "activity_receipts"
ADD COLUMN "isNotificationTarget" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "activity_receipts_userId_isNotificationTarget_activityId_idx"
ON "activity_receipts"("userId", "isNotificationTarget", "activityId");
