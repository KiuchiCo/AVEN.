CREATE TABLE "workspace_databases" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "properties" JSONB NOT NULL DEFAULT '[{"id":"name","name":"Name","type":"text"},{"id":"status","name":"Status","type":"status"}]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workspace_databases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "database_records" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "databaseId" UUID NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "database_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_databases_workspaceId_updatedAt_idx" ON "workspace_databases"("workspaceId", "updatedAt");
CREATE INDEX "database_records_workspaceId_databaseId_updatedAt_idx" ON "database_records"("workspaceId", "databaseId", "updatedAt");

ALTER TABLE "workspace_databases" ADD CONSTRAINT "workspace_databases_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "database_records" ADD CONSTRAINT "database_records_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "database_records" ADD CONSTRAINT "database_records_databaseId_fkey"
    FOREIGN KEY ("databaseId") REFERENCES "workspace_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
