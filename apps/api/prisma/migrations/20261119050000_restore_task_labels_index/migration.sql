-- Label filters use `labels has ...`; the earlier follow-up dropped this hand-written index.
CREATE INDEX IF NOT EXISTS "tasks_labels_gin_idx" ON "tasks" USING GIN ("labels");
