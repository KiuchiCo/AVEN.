CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "nextRunAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'QUEUED',
    "trigger" JSONB NOT NULL,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "error" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_step_runs" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepId" VARCHAR(40) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "summary" VARCHAR(500) NOT NULL DEFAULT '',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    CONSTRAINT "workflow_step_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_workspaceId_enabled_idx" ON "workflows"("workspaceId", "enabled");

CREATE INDEX "workflows_enabled_nextRunAt_idx" ON "workflows"("enabled", "nextRunAt");

CREATE UNIQUE INDEX "workflows_workspaceId_name_key" ON "workflows"("workspaceId", "name");

CREATE INDEX "workflow_runs_status_runAt_idx" ON "workflow_runs"("status", "runAt");

CREATE INDEX "workflow_runs_workflowId_createdAt_idx" ON "workflow_runs"("workflowId", "createdAt");

CREATE INDEX "workflow_runs_workspaceId_createdAt_idx" ON "workflow_runs"("workspaceId", "createdAt");

CREATE INDEX "workflow_step_runs_runId_startedAt_idx" ON "workflow_step_runs"("runId", "startedAt");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
