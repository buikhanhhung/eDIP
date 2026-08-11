import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { linkDocumentEntities, type EntityMention } from '../entity-linker';
import { GRAPH_ENTITY_TYPES, type EntityType } from '../entity-normalizer';
import type {
  GetGraphOptions,
  GraphEdge,
  GraphNode,
  GraphPayload,
  IGraphStore,
} from '../graph.port';

interface GraphRow {
  documentId: string;
  documentLabel: string;
  entityId: string;
  entityLabel: string;
  entityType: string;
  docCount: number;
}

/**
 * The only file in the app that writes graph SQL. Swapping in a different graph
 * database means adding a sibling here, not touching controllers or the client.
 */
@Injectable()
export class PostgresGraphStore implements IGraphStore {
  private readonly logger = new Logger(PostgresGraphStore.name);

  constructor(private readonly prisma: PrismaService) {}

  upsertDocumentEntities(documentId: string, text: string, entities: EntityMention[]) {
    return linkDocumentEntities(this.prisma, documentId, text, entities);
  }

  async getGraph({ minShared, types }: GetGraphOptions): Promise<GraphPayload> {
    const allowed = (types ?? GRAPH_ENTITY_TYPES) as readonly EntityType[];

    /**
     * `DISTINCT` is load-bearing. `DocumentEntity` is keyed on
     * `[documentId, entityId, mentionText]`, so one document mentioning the
     * same entity twice — `Ecloudvalley Vietnam Ltd` and `ECLOUDVALLEY
     * VIETNAM`, which normalise to one entity — produces two rows, two edges
     * with the same id, and cytoscape throws "Can not create second element
     * with ID", leaving the graph page blank.
     *
     * `d.status = 'completed'` keeps the deliberately-failed seed document off
     * the canvas.
     */
    const rows = await this.prisma.$queryRawUnsafe<GraphRow[]>(
      `WITH shared AS (
         SELECT de."entityId", count(DISTINCT de."documentId") AS doc_count
         FROM "DocumentEntity" de
         JOIN "Document" d ON d.id = de."documentId"
         JOIN "Entity" e ON e.id = de."entityId"
         WHERE d.status = 'completed' AND e.type = ANY($2::text[])
         GROUP BY de."entityId"
         HAVING count(DISTINCT de."documentId") >= $1
       )
       SELECT DISTINCT
         de."documentId"                        AS "documentId",
         COALESCE(d.title, d.filename)          AS "documentLabel",
         de."entityId"                          AS "entityId",
         e."displayName"                        AS "entityLabel",
         e.type                                 AS "entityType",
         s.doc_count::int                       AS "docCount"
       FROM "DocumentEntity" de
       JOIN shared s ON s."entityId" = de."entityId"
       JOIN "Entity" e ON e.id = de."entityId"
       JOIN "Document" d ON d.id = de."documentId"
       WHERE d.status = 'completed'`,
      minShared,
      allowed as unknown as string[],
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
          documentCount: row.docCount,
        },
      });

      // Keyed by the pair, so a duplicate mention cannot produce a second edge
      // even if the SQL above ever stops de-duplicating.
      const id = `${row.documentId}__${row.entityId}`;
      edges.set(id, { data: { id, source: row.documentId, target: row.entityId } });
    }

    this.logger.log(`graph(minShared=${minShared}): ${nodes.size} nodes, ${edges.size} edges`);
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }

  async getDocumentsForEntity(entityId: string) {
    const links = await this.prisma.documentEntity.findMany({
      where: { entityId, document: { status: 'completed' } },
      select: {
        document: { select: { id: true, title: true, filename: true, documentType: true } },
      },
      distinct: ['documentId'],
    });
    return links.map((link) => link.document);
  }

  async deleteByDocument(documentId: string, types?: readonly EntityType[]): Promise<void> {
    await this.prisma.documentEntity.deleteMany({
      where: {
        documentId,
        ...(types ? { entity: { type: { in: [...types] } } } : {}),
      },
    });
    // Entity rows left without links are harmless and may be shared with other
    // documents, so they are not garbage-collected here.
  }
}
