-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_completedById_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_createdById_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "task_comments" DROP CONSTRAINT "task_comments_authorId_fkey";

-- DropForeignKey
ALTER TABLE "task_comments" DROP CONSTRAINT "task_comments_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_comments" DROP CONSTRAINT "task_comments_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "task_followers" DROP CONSTRAINT "task_followers_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_followers" DROP CONSTRAINT "task_followers_userId_fkey";

-- DropForeignKey
ALTER TABLE "task_followers" DROP CONSTRAINT "task_followers_workspaceId_fkey";

-- DropIndex
DROP INDEX "tasks_labels_gin_idx";

-- AlterTable
ALTER TABLE "task_checklist_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_comments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "task_followers" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
