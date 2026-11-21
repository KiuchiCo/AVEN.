CREATE TABLE "document_folders" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "parentId" UUID,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_folders_workspaceId_parentId_idx" ON "document_folders"("workspaceId", "parentId");
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents" ADD COLUMN "folderId" UUID, ADD COLUMN "createdById" UUID, ADD COLUMN "docType" VARCHAR(32);
CREATE INDEX "documents_workspaceId_folderId_idx" ON "documents"("workspaceId", "folderId");
ALTER TABLE "documents" ADD CONSTRAINT "documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing documents keep their author when the activity log recorded who created them; otherwise the owner stays empty.
UPDATE "documents" d SET "createdById" = a."actorId"
FROM (SELECT DISTINCT ON ("entityId") "entityId", "actorId" FROM "workspace_activity" WHERE "entityType" = 'DOCUMENT' AND "message" LIKE 'created document%' ORDER BY "entityId", "createdAt" ASC) a
WHERE a."entityId" = d."id" AND d."createdById" IS NULL;
