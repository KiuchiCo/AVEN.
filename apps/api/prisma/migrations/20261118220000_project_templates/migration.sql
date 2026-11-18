CREATE TABLE "project_templates" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "taskTemplates" JSONB NOT NULL DEFAULT '[]',
  "milestoneTemplates" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "project_templates_workspaceId_updatedAt_idx" ON "project_templates"("workspaceId", "updatedAt");
