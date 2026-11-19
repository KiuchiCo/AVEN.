ALTER TABLE "activity_receipts" ADD COLUMN     "emailedAt" TIMESTAMPTZ(3);

ALTER TABLE "users" ADD COLUMN     "emailEnabledAt" TIMESTAMPTZ(3),
ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "activity_receipts_isNotificationTarget_emailedAt_createdAt_idx" ON "activity_receipts"("isNotificationTarget", "emailedAt", "createdAt");
