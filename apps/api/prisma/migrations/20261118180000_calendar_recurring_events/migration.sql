CREATE TYPE "CalendarRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "calendar_events"
ADD COLUMN "recurrence" "CalendarRecurrence",
ADD COLUMN "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "recurrenceUntil" TIMESTAMPTZ(3),
ADD COLUMN "recurrenceTimeZone" VARCHAR(80);

ALTER TABLE "calendar_events"
ADD CONSTRAINT "calendar_events_recurrenceInterval_check" CHECK ("recurrenceInterval" BETWEEN 1 AND 12);
