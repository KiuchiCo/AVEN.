CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" VARCHAR(12) NOT NULL,
    "kind" VARCHAR(12) NOT NULL DEFAULT 'text',
    "content" JSONB NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "pendingActions" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(100),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "model" VARCHAR(100) NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_workspaceId_userId_updatedAt_idx" ON "ai_conversations"("workspaceId", "userId", "updatedAt");

CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

CREATE INDEX "ai_usage_workspaceId_createdAt_idx" ON "ai_usage"("workspaceId", "createdAt");

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
