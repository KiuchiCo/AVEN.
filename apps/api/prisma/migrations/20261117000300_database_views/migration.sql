CREATE TYPE "DatabaseSortDirection" AS ENUM ('ASC', 'DESC');

CREATE TABLE "database_views" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "databaseId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "filterQuery" VARCHAR(200) NOT NULL DEFAULT '',
    "sortPropertyId" VARCHAR(80) NOT NULL DEFAULT 'updatedAt',
    "sortDirection" "DatabaseSortDirection" NOT NULL DEFAULT 'DESC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "database_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "database_views_databaseId_name_key" ON "database_views"("databaseId", "name");
CREATE INDEX "database_views_workspaceId_databaseId_createdAt_idx" ON "database_views"("workspaceId", "databaseId", "createdAt");

ALTER TABLE "database_views" ADD CONSTRAINT "database_views_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "database_views" ADD CONSTRAINT "database_views_databaseId_fkey"
    FOREIGN KEY ("databaseId") REFERENCES "workspace_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
