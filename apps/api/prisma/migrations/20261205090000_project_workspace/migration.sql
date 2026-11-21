CREATE TYPE "ProjectVisibility" AS ENUM ('WORKSPACE', 'TEAM');

ALTER TABLE "projects"
  ADD COLUMN "startAt" TIMESTAMPTZ(3),
  ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'WORKSPACE',
  ADD COLUMN "ownerId" UUID;

-- Existing projects keep working: their creator becomes the owner.
UPDATE "projects" SET "ownerId" = "createdById";

ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_members" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_milestones" ADD COLUMN "description" TEXT;
ALTER TABLE "tasks" ADD COLUMN "milestoneId" UUID;
CREATE INDEX "tasks_milestoneId_idx" ON "tasks"("milestoneId");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "project_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
