-- CreateTable
CREATE TABLE "synced_blocks" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "synced_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synced_blocks_workspaceId_idx" ON "synced_blocks"("workspaceId");

-- AddForeignKey
ALTER TABLE "synced_blocks" ADD CONSTRAINT "synced_blocks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
