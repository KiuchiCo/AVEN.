-- Emoji reactions on messages: one row per person, message and emoji.
CREATE TABLE "channel_message_reactions" (
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_message_reactions_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

CREATE INDEX "channel_message_reactions_messageId_idx" ON "channel_message_reactions"("messageId");

ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "channel_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
