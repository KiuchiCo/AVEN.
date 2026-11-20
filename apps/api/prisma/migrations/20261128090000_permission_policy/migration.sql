
-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "permissionPolicy" JSONB NOT NULL DEFAULT '{}';
