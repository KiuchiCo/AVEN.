-- CreateTable
CREATE TABLE "file_folders" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "parentId" UUID,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

CONSTRAINT "file_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "folderId" UUID,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "taskId" UUID,
    "documentId" UUID,
    "projectId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_folders_workspaceId_parentId_idx" ON "file_folders"("workspaceId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- CreateIndex
CREATE INDEX "stored_files_workspaceId_folderId_deletedAt_idx" ON "stored_files"("workspaceId", "folderId", "deletedAt");

-- CreateIndex
CREATE INDEX "stored_files_workspaceId_deletedAt_idx" ON "stored_files"("workspaceId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_storageKey_key" ON "file_versions"("storageKey");

-- CreateIndex
CREATE INDEX "file_versions_workspaceId_idx" ON "file_versions"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_fileId_version_key" ON "file_versions"("fileId", "version");

-- CreateIndex
CREATE INDEX "file_attachments_workspaceId_taskId_idx" ON "file_attachments"("workspaceId", "taskId");

-- CreateIndex
CREATE INDEX "file_attachments_workspaceId_documentId_idx" ON "file_attachments"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "file_attachments_workspaceId_projectId_idx" ON "file_attachments"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_fileId_taskId_key" ON "file_attachments"("fileId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_fileId_documentId_key" ON "file_attachments"("fileId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_fileId_projectId_key" ON "file_attachments"("fileId", "projectId");

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "file_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "file_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An attachment links a file to exactly one task, document, or project.
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_one_target_check"
  CHECK (num_nonnulls("taskId", "documentId", "projectId") = 1);
