CREATE TABLE "database_record_links" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "propertyId" VARCHAR(80) NOT NULL,
    "sourceRecordId" UUID NOT NULL,
    "targetRecordId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "database_record_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "database_record_links_sourceRecordId_propertyId_targetRecordId_key"
ON "database_record_links"("sourceRecordId", "propertyId", "targetRecordId");
CREATE INDEX "database_record_links_workspaceId_sourceRecordId_propertyId_idx"
ON "database_record_links"("workspaceId", "sourceRecordId", "propertyId");
CREATE INDEX "database_record_links_workspaceId_targetRecordId_idx"
ON "database_record_links"("workspaceId", "targetRecordId");

ALTER TABLE "database_record_links" ADD CONSTRAINT "database_record_links_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "database_record_links" ADD CONSTRAINT "database_record_links_sourceRecordId_fkey"
FOREIGN KEY ("sourceRecordId") REFERENCES "database_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "database_record_links" ADD CONSTRAINT "database_record_links_targetRecordId_fkey"
FOREIGN KEY ("targetRecordId") REFERENCES "database_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
