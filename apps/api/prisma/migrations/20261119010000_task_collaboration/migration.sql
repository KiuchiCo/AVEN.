CREATE TABLE "task_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspaceId" UUID NOT NULL, "taskId" UUID NOT NULL,
  "authorId" UUID NOT NULL, "body" VARCHAR(2000) NOT NULL, "mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "task_comments_workspaceId_taskId_createdAt_idx" ON "task_comments"("workspaceId", "taskId", "createdAt");

CREATE TABLE "task_checklist_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspaceId" UUID NOT NULL, "taskId" UUID NOT NULL,
  "createdById" UUID NOT NULL, "completedById" UUID, "title" VARCHAR(240) NOT NULL, "position" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_checklist_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_checklist_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "task_checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "task_checklist_items_workspaceId_taskId_position_idx" ON "task_checklist_items"("workspaceId", "taskId", "position");

CREATE TABLE "task_followers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspaceId" UUID NOT NULL, "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_followers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_followers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "task_followers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "task_followers_taskId_userId_key" ON "task_followers"("taskId", "userId");
CREATE INDEX "task_followers_workspaceId_taskId_idx" ON "task_followers"("workspaceId", "taskId");
