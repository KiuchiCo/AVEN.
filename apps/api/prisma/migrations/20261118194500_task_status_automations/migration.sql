CREATE TYPE "AutomationAction" AS ENUM ('SET_TASK_PRIORITY', 'ADD_ACTIVITY_NOTE');
CREATE TYPE "AutomationRunStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "automation_rules" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "fromStatus" "TaskStatus",
  "toStatus" "TaskStatus" NOT NULL,
  "action" "AutomationAction" NOT NULL,
  "priority" "TaskPriority",
  "activityMessage" VARCHAR(500),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "automation_runs" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "ruleId" UUID NOT NULL,
  "taskId" UUID,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'SUCCEEDED',
  "summary" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "automation_rules_workspaceId_enabled_toStatus_idx" ON "automation_rules"("workspaceId", "enabled", "toStatus");
CREATE INDEX "automation_runs_workspaceId_createdAt_idx" ON "automation_runs"("workspaceId", "createdAt");
CREATE INDEX "automation_runs_ruleId_createdAt_idx" ON "automation_runs"("ruleId", "createdAt");
