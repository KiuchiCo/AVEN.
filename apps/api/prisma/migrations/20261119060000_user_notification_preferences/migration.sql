-- Per-member Inbox preferences. Both default to on so existing members see no change.
ALTER TABLE "users" ADD COLUMN "notifyTeamActivity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notifyTaskUpdates" BOOLEAN NOT NULL DEFAULT true;
