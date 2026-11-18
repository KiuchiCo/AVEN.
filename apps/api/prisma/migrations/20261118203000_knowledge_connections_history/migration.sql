ALTER TABLE "knowledge_items"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "documentId" UUID,
  ADD COLUMN "taskId" UUID;

CREATE INDEX "knowledge_items_projectId_idx" ON "knowledge_items"("projectId");
CREATE INDEX "knowledge_items_documentId_idx" ON "knowledge_items"("documentId");
CREATE INDEX "knowledge_items_taskId_idx" ON "knowledge_items"("taskId");

ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "knowledge_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "knowledge_versions" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "knowledgeItemId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "projectId" UUID,
  "documentId" UUID,
  "taskId" UUID,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "sourceUrl" VARCHAR(2048),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_versions_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "knowledge_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "knowledge_versions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "knowledge_versions_workspaceId_knowledgeItemId_createdAt_idx" ON "knowledge_versions"("workspaceId", "knowledgeItemId", "createdAt");
