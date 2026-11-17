CREATE TABLE "knowledge_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" VARCHAR(2048),
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_items_workspaceId_archivedAt_isPinned_updatedAt_idx" ON "knowledge_items"("workspaceId", "archivedAt", "isPinned", "updatedAt");
CREATE INDEX "knowledge_items_createdById_idx" ON "knowledge_items"("createdById");

ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
