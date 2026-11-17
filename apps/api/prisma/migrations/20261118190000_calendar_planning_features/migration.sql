CREATE TYPE "CalendarEventType" AS ENUM ('MEETING', 'FOCUS', 'PERSONAL', 'REMINDER', 'OTHER');

ALTER TABLE "calendar_events"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "description" VARCHAR(2000),
  ADD COLUMN "location" VARCHAR(250),
  ADD COLUMN "type" "CalendarEventType" NOT NULL DEFAULT 'MEETING',
  ADD COLUMN "isAllDay" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "calendar_events_projectId_idx" ON "calendar_events"("projectId");
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
