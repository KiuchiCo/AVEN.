CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "workspace_invites" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" VARCHAR(64) NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invites_tokenHash_key" ON "workspace_invites"("tokenHash");
CREATE INDEX "workspace_invites_workspaceId_status_createdAt_idx" ON "workspace_invites"("workspaceId", "status", "createdAt");
CREATE INDEX "workspace_invites_email_status_expiresAt_idx" ON "workspace_invites"("email", "status", "expiresAt");

ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
