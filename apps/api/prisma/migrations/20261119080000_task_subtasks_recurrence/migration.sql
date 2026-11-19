-- Subtasks (one level) and repeating tasks. Existing tasks are unaffected: no parent, no repeat.
ALTER TABLE "tasks"
  ADD COLUMN "parentId" UUID,
  ADD COLUMN "recurrence" "CalendarRecurrence",
  ADD COLUMN "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "recurrenceUntil" TIMESTAMPTZ(3),
  ADD COLUMN "recurrenceSpawnedAt" TIMESTAMPTZ(3);

CREATE INDEX "tasks_parentId_idx" ON "tasks"("parentId");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
