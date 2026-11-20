-- CreateTable
CREATE TABLE "search_embeddings" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "entityType" VARCHAR(20) NOT NULL,
    "entityId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "excerpt" VARCHAR(400) NOT NULL,
    "vector" DOUBLE PRECISION[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_embeddings_workspaceId_entityType_idx" ON "search_embeddings"("workspaceId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "search_embeddings_entityType_entityId_chunkIndex_key" ON "search_embeddings"("entityType", "entityId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "search_embeddings" ADD CONSTRAINT "search_embeddings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

