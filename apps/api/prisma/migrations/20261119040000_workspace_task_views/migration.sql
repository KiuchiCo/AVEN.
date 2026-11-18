CREATE TABLE "workspace_task_views" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_task_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_task_views_workspaceId_name_key"
ON "workspace_task_views"("workspaceId", "name");

CREATE INDEX "workspace_task_views_workspaceId_updatedAt_idx"
ON "workspace_task_views"("workspaceId", "updatedAt");

ALTER TABLE "workspace_task_views"
ADD CONSTRAINT "workspace_task_views_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_task_views"
ADD CONSTRAINT "workspace_task_views_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
