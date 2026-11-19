-- Identifies events that came from an imported .ics file so re-importing updates them instead of duplicating.
ALTER TABLE "calendar_events" ADD COLUMN "externalUid" VARCHAR(255);
CREATE UNIQUE INDEX "calendar_events_workspaceId_externalUid_key" ON "calendar_events"("workspaceId", "externalUid");
