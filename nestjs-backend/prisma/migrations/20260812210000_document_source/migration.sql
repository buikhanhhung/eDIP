-- Which door a document came through, as distinct from how its text was read.
-- Every existing row predates connectors and so came from a browser upload,
-- which is exactly what the default supplies — no backfill needed.
--
-- Written by hand rather than generated: the generated diff also wanted to drop
-- "search_tsv", a generated column the init migration adds in raw SQL and the
-- Prisma schema cannot express. Dropping it would silently disable full-text
-- search.
CREATE TYPE "DocumentSource" AS ENUM ('upload', 'google_drive');

ALTER TABLE "Document" ADD COLUMN "source" "DocumentSource" NOT NULL DEFAULT 'upload';

CREATE INDEX "Document_source_idx" ON "Document"("source");
