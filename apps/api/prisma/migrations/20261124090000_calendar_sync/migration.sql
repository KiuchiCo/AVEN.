
-- CreateEnum
CREATE TYPE "CalendarProviderKey" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "calendar_connections" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "connectedById" UUID NOT NULL,
    "provider" "CalendarProviderKey" NOT NULL,
    "accountEmail" VARCHAR(320) NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(300),
    "syncingSince" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_event_links" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "eventId" UUID,
    "externalId" VARCHAR(255) NOT NULL,
    "etag" VARCHAR(255),
    "localSyncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_event_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_connections_status_lastSyncedAt_idx" ON "calendar_connections"("status", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_connections_workspaceId_provider_accountEmail_key" ON "calendar_connections"("workspaceId", "provider", "accountEmail");

-- CreateIndex
CREATE INDEX "external_event_links_connectionId_eventId_idx" ON "external_event_links"("connectionId", "eventId");

-- CreateIndex
CREATE INDEX "external_event_links_eventId_idx" ON "external_event_links"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "external_event_links_connectionId_externalId_key" ON "external_event_links"("connectionId", "externalId");

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event_links" ADD CONSTRAINT "external_event_links_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_event_links" ADD CONSTRAINT "external_event_links_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

