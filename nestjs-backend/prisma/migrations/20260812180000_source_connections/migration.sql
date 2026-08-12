-- One connection per owner per provider: reconnecting should replace the grant
-- rather than leave an older one nobody can see or revoke.
CREATE TABLE "SourceConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountEmail" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceConnection_ownerId_provider_key" ON "SourceConnection"("ownerId", "provider");
CREATE INDEX "SourceConnection_provider_idx" ON "SourceConnection"("provider");

ALTER TABLE "SourceConnection" ADD CONSTRAINT "SourceConnection_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
