-- Entities, mentions and relations move out of Postgres entirely.
--
-- FalkorDB becomes their only home, matching ECVBot: Postgres owns the source
-- records (documents, chunks, users, audit) and the graph owns the graph.
-- `:Document` nodes in FalkorDB are a projection of "Document" rows, keyed by
-- the same id, so a document deleted here must also be deleted there — there
-- is no foreign key doing it now.
--
-- Reload the graph with `pnpm prisma db seed`, which writes straight to
-- FalkorDB.

DROP TABLE IF EXISTS "EntityRelation";
DROP TABLE IF EXISTS "DocumentEntity";
DROP TABLE IF EXISTS "Entity";
