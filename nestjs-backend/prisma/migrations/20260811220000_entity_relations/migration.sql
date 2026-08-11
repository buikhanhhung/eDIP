-- Typed relationships between entities, extracted per chunk, each row carrying
-- the sentence it came from.

ALTER TABLE "Entity" ADD COLUMN "description" TEXT;
ALTER TABLE "Entity" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Written and read only through raw SQL: Prisma models it as Unsupported.
ALTER TABLE "Entity" ADD COLUMN "name_embedding" vector(1024);

CREATE TABLE "EntityRelation" (
  "id"             TEXT PRIMARY KEY,
  "sourceEntityId" TEXT NOT NULL REFERENCES "Entity"(id) ON DELETE CASCADE,
  "targetEntityId" TEXT NOT NULL REFERENCES "Entity"(id) ON DELETE CASCADE,
  "type"           TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "evidence"       TEXT NOT NULL,
  "evidenceStart"  INTEGER,
  "evidenceEnd"    INTEGER,
  "documentId"     TEXT NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
  "confidence"     DOUBLE PRECISION,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Re-extraction replaces a document's edges instead of doubling them.
CREATE UNIQUE INDEX "EntityRelation_document_pair_type_key"
  ON "EntityRelation" ("documentId", "sourceEntityId", "targetEntityId", "type");
CREATE INDEX "EntityRelation_sourceEntityId_idx" ON "EntityRelation" ("sourceEntityId");
CREATE INDEX "EntityRelation_targetEntityId_idx" ON "EntityRelation" ("targetEntityId");
CREATE INDEX "EntityRelation_documentId_idx" ON "EntityRelation" ("documentId");

-- No ivfflat on name_embedding, for the same reason the chunk table has none:
-- a few dozen vectors split across 100 lists and probed one at a time returns
-- near-random neighbours. Sequential scan is both faster and correct here.
