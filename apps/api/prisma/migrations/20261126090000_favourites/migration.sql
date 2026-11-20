
-- CreateEnum
CREATE TYPE "FavouriteKind" AS ENUM ('PROJECT', 'DOCUMENT', 'DATABASE', 'WHITEBOARD');

-- CreateTable
CREATE TABLE "favourites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "FavouriteKind" NOT NULL,
    "entityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favourites_userId_workspaceId_createdAt_idx" ON "favourites"("userId", "workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favourites_userId_kind_entityId_key" ON "favourites"("userId", "kind", "entityId");

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

