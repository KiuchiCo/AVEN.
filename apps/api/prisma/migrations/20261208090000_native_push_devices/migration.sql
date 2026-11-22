-- CreateTable
CREATE TABLE "native_push_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" VARCHAR(200) NOT NULL,
    "environment" VARCHAR(12) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "native_push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "native_push_devices_token_key" ON "native_push_devices"("token");

-- CreateIndex
CREATE INDEX "native_push_devices_userId_idx" ON "native_push_devices"("userId");

-- AddForeignKey
ALTER TABLE "native_push_devices" ADD CONSTRAINT "native_push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
