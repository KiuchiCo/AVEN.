
-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('CHANNEL', 'DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "parentId" UUID;

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "dmKey" VARCHAR(80),
ADD COLUMN     "kind" "ChannelKind" NOT NULL DEFAULT 'CHANNEL',
ALTER COLUMN "name" DROP NOT NULL;

-- CreateTable
CREATE TABLE "channel_members" (
    "channelId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateIndex
CREATE INDEX "channel_members_userId_idx" ON "channel_members"("userId");

-- CreateIndex
CREATE INDEX "channel_messages_parentId_createdAt_idx" ON "channel_messages"("parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "channels_workspaceId_dmKey_key" ON "channels"("workspaceId", "dmKey");

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

