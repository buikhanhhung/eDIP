-- Spotting a re-upload needs the bytes to be comparable without reading them
-- back off disk, and finding the other versions of a file needs the name to be
-- searchable. Both are lookups on every upload, so both are indexed.
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;

CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");
CREATE INDEX "Document_filename_idx" ON "Document"("filename");
