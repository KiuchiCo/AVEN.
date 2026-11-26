-- "Send only new events": events made in AVEN before this time are never sent to the connected calendar.
ALTER TABLE "calendar_connections" ADD COLUMN "pushFrom" TIMESTAMPTZ(3);
