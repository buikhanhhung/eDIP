import { Inject, Injectable, Logger } from '@nestjs/common';
import { FALKORDB_CLIENT } from '@infrastructure/falkordb/falkordb.di-token';
import type { IFalkorDbClient } from '@infrastructure/falkordb/falkordb.port';
import { PrismaService } from '@shared/database/prisma.service';
import type { EntityMention } from '../entity-linker';
import { GRAPH_ENTITY_TYPES, type EntityType } from '../entity-normalizer';
import type {
  EntityCandidate,
  GetGraphOptions,
  GraphEdge,
  GraphNode,
  GraphPayload,
  IGraphStore,
  RelationInput,
  ResolvedEntity,
} from '../graph.port';
import { PostgresGraphStore } from './postgres-graph.store';

interface MentionRow {
  documentId: string;
  documentLabel: string;
  entityId: string;
  entityLabel: string;
  entityType: string;
  entityDescription: string | null;
  docCount: number;
}

interface RelationRow {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  description: string;
  evidence: string;
  documentId: string;
  confidence: number | null;
}

/**
 * FalkorDB-backed graph, layered over the Postgres store.
 *
 * Writes go to Postgres first and are then mirrored into the graph. Postgres
 * stays the source of truth because two features outside the graph depend on
 * it: source highlighting reads character offsets from `DocumentEntity`, and
 * deleting a document relies on foreign-key cascade. Making FalkorDB
 * authoritative would mean reimplementing both, and holding referential
 * integrity by hand across two stores.
 *
 * Reads are pure Cypher. That is the point of switching: traversals the SQL
 * version expresses as joins become path patterns, and variable-length hops
 * become possible at all.
 *
 * A mirror failure is logged rather than thrown. The write already succeeded
 * in the store that owns it, and failing the request afterwards would leave
 * the caller believing nothing happened. `pnpm graph:sync` repairs drift.
 */
@Injectable()
export class FalkorGraphStore implements IGraphStore {
  private readonly logger = new Logger(FalkorGraphStore.name);

  constructor(
    private readonly postgres: PostgresGraphStore,
    private readonly prisma: PrismaService,
    @Inject(FALKORDB_CLIENT) private readonly falkor: IFalkorDbClient,
  ) {}

  // ---- writes: Postgres owns, FalkorDB mirrors ----------------------------

  async upsertDocumentEntities(documentId: string, text: string, entities: EntityMention[]) {
    const result = await this.postgres.upsertDocumentEntities(documentId, text, entities);
    await this.mirrorDocument(documentId);
    return result;
  }

  async resolveEntity(candidate: EntityCandidate): Promise<ResolvedEntity> {
    const resolved = await this.postgres.resolveEntity(candidate);
    await this.mirrorEntity(resolved.entityId);
    return resolved;
  }

  async linkMention(
    documentId: string,
    entityId: string,
    mentionText: string,
    documentText: string,
    confidence?: number,
  ) {
    const result = await this.postgres.linkMention(
      documentId,
      entityId,
      mentionText,
      documentText,
      confidence,
    );

    await this.safeMirror('linkMention', async () => {
      await this.mirrorDocumentNode(documentId);
      await this.falkor.query(
        `MATCH (d:Document {id: $documentId}), (e:Entity {id: $entityId})
         MERGE (d)-[:MENTIONS]->(e)`,
        { documentId, entityId },
      );
    });

    return result;
  }

  async replaceRelations(documentId: string, relations: RelationInput[]): Promise<number> {
    const written = await this.postgres.replaceRelations(documentId, relations);

    await this.safeMirror('replaceRelations', async () => {
      // Purge this document's edges before writing, exactly as the SQL side
      // does: a re-run must replace its own work, not add to it.
      await this.falkor.query(
        `MATCH ()-[r:RELATES {document_id: $documentId}]->() DELETE r`,
        { documentId },
      );

      const rows = await this.prisma.entityRelation.findMany({
        where: { documentId },
        select: {
          id: true,
          sourceEntityId: true,
          targetEntityId: true,
          type: true,
          description: true,
          evidence: true,
          confidence: true,
        },
      });

      for (const row of rows) {
        await this.falkor.query(
          `MATCH (a:Entity {id: $sourceId}), (b:Entity {id: $targetId})
           MERGE (a)-[r:RELATES {id: $id}]->(b)
           SET r.type = $type, r.description = $description, r.evidence = $evidence,
               r.document_id = $documentId, r.confidence = $confidence`,
          {
            id: row.id,
            sourceId: row.sourceEntityId,
            targetId: row.targetEntityId,
            type: row.type,
            description: row.description,
            evidence: row.evidence,
            documentId,
            confidence: row.confidence,
          },
        );
      }
    });

    return written;
  }

  async deleteByDocument(documentId: string, types?: readonly EntityType[]): Promise<void> {
    await this.postgres.deleteByDocument(documentId, types);
    await this.mirrorDocument(documentId);
  }

  // ---- reads: Cypher ------------------------------------------------------

  async getGraph({ minShared, types, includeRelations }: GetGraphOptions): Promise<GraphPayload> {
    const allowed = [...((types ?? GRAPH_ENTITY_TYPES) as readonly EntityType[])];

    // The shared-entity filter is a single aggregation over the pattern, where
    // the SQL version needs a CTE plus three joins.
    const rows = await this.falkor.query<MentionRow>(
      `MATCH (d:Document {status: 'completed'})-[:MENTIONS]->(e:Entity)
       WHERE e.type IN $types
       WITH e, count(DISTINCT d) AS docCount
       WHERE docCount >= $minShared
       MATCH (doc:Document {status: 'completed'})-[:MENTIONS]->(e)
       RETURN doc.id AS documentId, doc.label AS documentLabel,
              e.id AS entityId, e.display_name AS entityLabel, e.type AS entityType,
              e.description AS entityDescription, docCount AS docCount`,
      { types: allowed, minShared },
    );

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();

    for (const row of rows) {
      nodes.set(row.documentId, {
        data: { id: row.documentId, label: row.documentLabel, kind: 'document' },
      });
      nodes.set(row.entityId, {
        data: {
          id: row.entityId,
          label: row.entityLabel,
          kind: 'entity',
          type: row.entityType,
          documentCount: Number(row.docCount),
          description: row.entityDescription ?? undefined,
        },
      });

      const id = `${row.documentId}__${row.entityId}`;
      edges.set(id, {
        data: { id, source: row.documentId, target: row.entityId, kind: 'mentions' },
      });
    }

    if (includeRelations) {
      const present = [...nodes.keys()];
      const relations = await this.falkor.query<RelationRow>(
        `MATCH (a:Entity)-[r:RELATES]->(b:Entity)
         WHERE a.id IN $ids AND b.id IN $ids
         RETURN r.id AS id, a.id AS sourceEntityId, b.id AS targetEntityId,
                r.type AS type, r.description AS description, r.evidence AS evidence,
                r.document_id AS documentId, r.confidence AS confidence`,
        { ids: present },
      );

      for (const relation of relations) {
        edges.set(relation.id, {
          data: {
            id: relation.id,
            source: relation.sourceEntityId,
            target: relation.targetEntityId,
            kind: 'relates',
            label: relation.type,
            evidence: relation.evidence,
            documentId: relation.documentId,
            confidence: relation.confidence ?? undefined,
          },
        });
      }
    }

    this.logger.log(`falkor graph(minShared=${minShared}): ${nodes.size} nodes, ${edges.size} edges`);
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }

  async getDocumentsForEntity(entityId: string) {
    return this.falkor.query<{
      id: string;
      title: string | null;
      filename: string;
      documentType: string | null;
    }>(
      `MATCH (d:Document {status: 'completed'})-[:MENTIONS]->(:Entity {id: $entityId})
       RETURN DISTINCT d.id AS id, d.title AS title, d.filename AS filename,
              d.document_type AS documentType`,
      { entityId },
    );
  }

  async getRelationsForEntity(entityId: string) {
    const rows = await this.falkor.query<{
      id: string;
      type: string;
      description: string;
      evidence: string;
      documentId: string;
      otherEntityId: string;
      otherEntityName: string;
      direction: string;
    }>(
      `MATCH (e:Entity {id: $entityId})-[r:RELATES]->(other:Entity)
       RETURN r.id AS id, r.type AS type, r.description AS description, r.evidence AS evidence,
              r.document_id AS documentId, other.id AS otherEntityId,
              other.display_name AS otherEntityName, 'out' AS direction
       UNION
       MATCH (other:Entity)-[r:RELATES]->(e:Entity {id: $entityId})
       RETURN r.id AS id, r.type AS type, r.description AS description, r.evidence AS evidence,
              r.document_id AS documentId, other.id AS otherEntityId,
              other.display_name AS otherEntityName, 'in' AS direction`,
      { entityId },
    );

    return rows.map((row) => ({ ...row, direction: row.direction === 'out' ? ('out' as const) : ('in' as const) }));
  }

  // ---- mirroring ----------------------------------------------------------

  /** Rewrites one document's node and mention edges from Postgres. */
  private async mirrorDocument(documentId: string): Promise<void> {
    await this.safeMirror('mirrorDocument', async () => {
      await this.mirrorDocumentNode(documentId);

      const links = await this.prisma.documentEntity.findMany({
        where: { documentId },
        select: { entityId: true },
        distinct: ['entityId'],
      });

      await this.falkor.query(
        `MATCH (:Document {id: $documentId})-[m:MENTIONS]->() DELETE m`,
        { documentId },
      );

      for (const link of links) {
        await this.mirrorEntity(link.entityId);
        await this.falkor.query(
          `MATCH (d:Document {id: $documentId}), (e:Entity {id: $entityId})
           MERGE (d)-[:MENTIONS]->(e)`,
          { documentId, entityId: link.entityId },
        );
      }
    });
  }

  private async mirrorDocumentNode(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, filename: true, documentType: true, status: true },
    });
    if (!document) return;

    await this.falkor.query(
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

  private async mirrorEntity(entityId: string): Promise<void> {
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, type: true, displayName: true, normalizedName: true, description: true },
    });
    if (!entity) return;

    await this.falkor.query(
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

  private async safeMirror(operation: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `graph mirror failed during ${operation}; Postgres is still correct, run "pnpm graph:sync" to repair: ${(error as Error).message}`,
      );
    }
  }
}
