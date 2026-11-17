CREATE TABLE "workspace_activity" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" UUID NOT NULL,
    "message" VARCHAR(240) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_activity_workspaceId_createdAt_idx"
ON "workspace_activity"("workspaceId", "createdAt");

CREATE INDEX "workspace_activity_entityType_entityId_idx"
ON "workspace_activity"("entityType", "entityId");

ALTER TABLE "workspace_activity" ADD CONSTRAINT "workspace_activity_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_activity" ADD CONSTRAINT "workspace_activity_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
