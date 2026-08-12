-- One row per model call, so spend can be sliced by date, purpose and model
-- later. A running total could answer none of those questions.
--
-- Written by hand for the same reason as the previous migration: the generated
-- diff also wants to drop "search_tsv", a generated column the Prisma schema
-- cannot express and full-text search depends on.
CREATE TYPE "TokenPurpose" AS ENUM ('answer', 'analysis', 'entities', 'vision', 'embedding');

CREATE TABLE "TokenUsage" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "purpose" "TokenPurpose" NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "reported" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TokenUsage_createdAt_idx" ON "TokenUsage"("createdAt");
CREATE INDEX "TokenUsage_purpose_idx" ON "TokenUsage"("purpose");
