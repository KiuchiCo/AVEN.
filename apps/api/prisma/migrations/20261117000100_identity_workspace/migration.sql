-- Add stable external identity mapping without using email as an identity key.
ALTER TABLE "users"
ADD COLUMN "identityIssuer" VARCHAR(512),
ADD COLUMN "identitySubject" VARCHAR(255);

CREATE UNIQUE INDEX "users_identityIssuer_identitySubject_key"
ON "users"("identityIssuer", "identitySubject");

-- A unique owner reference guarantees at most one personal workspace per user.
ALTER TABLE "workspaces"
ADD COLUMN "personalOwnerId" UUID;

CREATE UNIQUE INDEX "workspaces_personalOwnerId_key"
ON "workspaces"("personalOwnerId");

ALTER TABLE "workspaces"
ADD CONSTRAINT "workspaces_personalOwnerId_fkey"
FOREIGN KEY ("personalOwnerId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
