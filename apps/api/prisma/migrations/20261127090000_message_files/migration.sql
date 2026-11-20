
-- CreateTable
CREATE TABLE "channel_message_files" (
    "messageId" UUID NOT NULL,
    "fileId" UUID NOT NULL,

    CONSTRAINT "channel_message_files_pkey" PRIMARY KEY ("messageId","fileId")
);

-- CreateIndex
CREATE INDEX "channel_message_files_fileId_idx" ON "channel_message_files"("fileId");

-- AddForeignKey
ALTER TABLE "channel_message_files" ADD CONSTRAINT "channel_message_files_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_message_files" ADD CONSTRAINT "channel_message_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

