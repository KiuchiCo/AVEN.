CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "planKey" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "provider" VARCHAR(20),
    "providerCustomerId" VARCHAR(100),
    "providerSubscriptionId" VARCHAR(100),
    "limitsOverride" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "providerEventId" VARCHAR(100) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "workspaceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_invoices" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "providerInvoiceId" VARCHAR(100) NOT NULL,
    "number" VARCHAR(60),
    "status" VARCHAR(20) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "hostedUrl" VARCHAR(500),
    "periodStart" TIMESTAMPTZ(3),
    "periodEnd" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_workspaceId_key" ON "subscriptions"("workspaceId");

CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

CREATE UNIQUE INDEX "billing_events_provider_providerEventId_key" ON "billing_events"("provider", "providerEventId");

CREATE UNIQUE INDEX "billing_invoices_providerInvoiceId_key" ON "billing_invoices"("providerInvoiceId");

CREATE INDEX "billing_invoices_workspaceId_createdAt_idx" ON "billing_invoices"("workspaceId", "createdAt");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
