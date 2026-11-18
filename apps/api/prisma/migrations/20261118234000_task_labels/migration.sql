ALTER TABLE "tasks" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "tasks_labels_gin_idx" ON "tasks" USING GIN ("labels");
