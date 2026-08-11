import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FALKORDB_CLIENT } from '../src/infrastructure/falkordb/falkordb.di-token';
import type { IFalkorDbClient } from '../src/infrastructure/falkordb/falkordb.port';
import { PrismaService } from '../src/shared/database/prisma.service';

/**
 * Rebuilds the FalkorDB graph from Postgres, which is the source of truth.
 *
 * Drop-then-rebuild rather than incremental repair: the graph holds no fact
 * that Postgres does not, so throwing it away costs nothing and removes every
 * class of drift at once — including edges left behind by a mirror that failed
 * halfway through a write.
 *
 *   pnpm graph:sync
 */
async function main() {
  const logger = new Logger('graph-sync');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService, { strict: false });
  const falkor = app.get<IFalkorDbClient>(FALKORDB_CLIENT, { strict: false });

  if (!falkor.isConnected()) {
    throw new Error(
      'FalkorDB is not reachable. Start it with: docker compose -f docker-compose.dev.yml up -d falkordb',
    );
  }

  await falkor.deleteGraph();
  await falkor.ensureSchema();
  logger.log('graph dropped and indexes recreated');

  const entities = await prisma.entity.findMany({
    select: { id: true, type: true, displayName: true, normalizedName: true, description: true },
  });
  for (const entity of entities) {
    await falkor.query(
      `MERGE (e:Entity {id: $id})
       SET e.type = $type, e.display_name = $displayName,
           e.normalized_name = $normalizedName, e.description = $description`,
      {
        id: entity.id,
        type: entity.type,
        displayName: entity.displayName,
        normalizedName: entity.normalizedName,
        description: entity.description,
      },
    );
  }
  logger.log(`${entities.length} entities`);

  const documents = await prisma.document.findMany({
    select: { id: true, title: true, filename: true, documentType: true, status: true },
  });
  for (const document of documents) {
    await falkor.query(
      `MERGE (d:Document {id: $id})
       SET d.label = $label, d.title = $title, d.filename = $filename,
           d.document_type = $documentType, d.status = $status`,
      {
        id: document.id,
        label: document.title ?? document.filename,
        title: document.title,
        filename: document.filename,
        documentType: document.documentType,
        status: document.status,
      },
    );
  }
  logger.log(`${documents.length} documents`);

  // One edge per document-entity pair. The table allows several rows for the
  // same pair — one per distinct mention text — and collapsing them here is
  // what stops the canvas receiving duplicate edges.
  const mentions = await prisma.documentEntity.findMany({
    select: { documentId: true, entityId: true },
    distinct: ['documentId', 'entityId'],
  });
  for (const mention of mentions) {
    await falkor.query(
      `MATCH (d:Document {id: $documentId}), (e:Entity {id: $entityId})
       MERGE (d)-[:MENTIONS]->(e)`,
      mention,
    );
  }
  logger.log(`${mentions.length} mention edges`);

  const relations = await prisma.entityRelation.findMany({
    select: {
      id: true,
      sourceEntityId: true,
      targetEntityId: true,
      type: true,
      description: true,
      evidence: true,
      documentId: true,
      confidence: true,
    },
  });
  for (const relation of relations) {
    await falkor.query(
      `MATCH (a:Entity {id: $sourceId}), (b:Entity {id: $targetId})
       MERGE (a)-[r:RELATES {id: $id}]->(b)
       SET r.type = $type, r.description = $description, r.evidence = $evidence,
           r.document_id = $documentId, r.confidence = $confidence`,
      {
        id: relation.id,
        sourceId: relation.sourceEntityId,
        targetId: relation.targetEntityId,
        type: relation.type,
        description: relation.description,
        evidence: relation.evidence,
        documentId: relation.documentId,
        confidence: relation.confidence,
      },
    );
  }
  logger.log(`${relations.length} relation edges`);

  const counts = await falkor.query<{ nodes: number }>(
    'MATCH (n) RETURN count(n) AS nodes',
  );
  logger.log(`done — graph holds ${counts[0]?.nodes ?? 0} nodes`);

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
