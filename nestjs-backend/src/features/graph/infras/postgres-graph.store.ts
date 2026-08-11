import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { decideDedupe, type VectorMatch } from '../entity-dedup';
import { linkDocumentEntities, type EntityMention } from '../entity-linker';
import { GRAPH_ENTITY_TYPES, normalizeEntityName, type EntityType } from '../entity-normalizer';
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

  async resolveEntity(candidate: EntityCandidate): Promise<ResolvedEntity> {
    const normalizedName = normalizeEntityName(candidate.name);
    if (!normalizedName) {
      throw new Error(`Entity name "${candidate.name}" normalises to nothing`);
    }

    const exact = await this.prisma.entity.findUnique({
      where: { type_normalizedName: { type: candidate.type, normalizedName } },
      select: { id: true },
    });

    const nearest = exact ? null : await this.findNearestEntity(candidate);
    const plan = decideDedupe(
      { name: candidate.name, type: candidate.type },
      exact ? { entityId: exact.id } : null,
      nearest,
    );

    if (plan.action === 'REUSE') {
      // A better description is worth keeping; an existing one is not
      // overwritten with an empty one.
      if (candidate.description) {
        await this.prisma.entity.update({
          where: { id: plan.matchedEntityId! },
          data: { description: candidate.description },
        });
      }
      return { entityId: plan.matchedEntityId!, action: plan.action, reason: plan.reason };
    }

    if (plan.action === 'MERGE_AS_ALIAS') {
      // The canonical displayName is left alone: a merge must not rename the
      // node under everyone who already knows it. The new spelling is recorded
      // so a human can see what was absorbed, and undo it if the merge is wrong.
      const merged = await this.prisma.entity.findUnique({
        where: { id: plan.matchedEntityId! },
        select: { aliases: true, displayName: true },
      });
      const alias = candidate.name.trim();
      if (merged && alias !== merged.displayName && !merged.aliases.includes(alias)) {
        await this.prisma.entity.update({
          where: { id: plan.matchedEntityId! },
          data: { aliases: { push: alias } },
        });
      }
      this.logger.log(`merged "${candidate.name}" into ${plan.matchedEntityId} — ${plan.reason}`);
      return { entityId: plan.matchedEntityId!, action: plan.action, reason: plan.reason };
    }

    const id = randomUUID();
    // Raw insert: `name_embedding` is a pgvector column Prisma will not write.
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "Entity" (id, type, "normalizedName", "displayName", description, aliases, name_embedding)
       VALUES ($1, $2, $3, $4, $5, ARRAY[]::text[], $6::vector)`,
      id,
      candidate.type,
      normalizedName,
      candidate.name.trim(),
      candidate.description ?? null,
      candidate.embedding ? toVectorLiteral(candidate.embedding) : null,
    );
    return { entityId: id, action: plan.action, reason: plan.reason };
  }

  /**
   * Nearest same-type entity by cosine similarity.
   *
   * `1 - (a <=> b)` is true cosine similarity, so the threshold in
   * `entity-dedup.ts` means what it says. Filtering by type in SQL rather than
   * after the fact keeps a closer wrong-type neighbour from hiding the right
   * candidate behind the `LIMIT 1`.
   */
  private async findNearestEntity(candidate: EntityCandidate): Promise<VectorMatch | null> {
    if (!candidate.embedding) return null;

    const rows = await this.prisma.$queryRawUnsafe<
      { entityId: string; similarity: number; type: string }[]
    >(
      `SELECT id AS "entityId", 1 - (name_embedding <=> $1::vector) AS similarity, type
       FROM "Entity"
       WHERE name_embedding IS NOT NULL AND type = $2
       ORDER BY name_embedding <=> $1::vector
       LIMIT 1`,
      toVectorLiteral(candidate.embedding),
      candidate.type,
    );
    return rows[0] ?? null;
  }

  async linkMention(
    documentId: string,
    entityId: string,
    mentionText: string,
    documentText: string,
    confidence?: number,
  ): Promise<{ located: boolean }> {
    const charStart = documentText.indexOf(mentionText);

    await this.prisma.documentEntity.upsert({
      where: { documentId_entityId_mentionText: { documentId, entityId, mentionText } },
      update: {},
      create: {
        documentId,
        entityId,
        mentionText,
        charStart: charStart >= 0 ? charStart : null,
        charEnd: charStart >= 0 ? charStart + mentionText.length : null,
        confidence: confidence ?? null,
      },
    });

    return { located: charStart >= 0 };
  }

  async replaceRelations(documentId: string, relations: RelationInput[]): Promise<number> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { textContent: true },
    });
    const text = document?.textContent ?? '';

    await this.prisma.entityRelation.deleteMany({ where: { documentId } });
    if (relations.length === 0) return 0;

    let written = 0;
    for (const relation of relations) {
      // Self-loops carry no information and clutter the canvas.
      if (relation.sourceEntityId === relation.targetEntityId) continue;

      // The evidence position is measured here, never taken from the model.
      const evidenceStart = text.indexOf(relation.evidence);

      await this.prisma.entityRelation.upsert({
        where: {
          documentId_sourceEntityId_targetEntityId_type: {
            documentId,
            sourceEntityId: relation.sourceEntityId,
            targetEntityId: relation.targetEntityId,
            type: relation.type,
          },
        },
        update: {},
        create: {
          documentId,
          sourceEntityId: relation.sourceEntityId,
          targetEntityId: relation.targetEntityId,
          type: relation.type,
          description: relation.description,
          evidence: relation.evidence,
          evidenceStart: evidenceStart >= 0 ? evidenceStart : null,
          evidenceEnd: evidenceStart >= 0 ? evidenceStart + relation.evidence.length : null,
          confidence: relation.confidence ?? null,
        },
      });
      written += 1;
    }

    this.logger.log(`wrote ${written} relations for ${documentId}`);
    return written;
  }

  async getGraph({ minShared, types, includeRelations }: GetGraphOptions): Promise<GraphPayload> {
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
    const rows = await this.prisma.$queryRawUnsafe<MentionRow[]>(
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
         e.description                          AS "entityDescription",
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
          description: row.entityDescription ?? undefined,
        },
      });

      // Keyed by the pair, so a duplicate mention cannot produce a second edge
      // even if the SQL above ever stops de-duplicating.
      const id = `${row.documentId}__${row.entityId}`;
      edges.set(id, {
        data: { id, source: row.documentId, target: row.entityId, kind: 'mentions' },
      });
    }

    if (includeRelations) {
      // Only between entities already on the canvas: an edge to a node that was
      // filtered out would be dropped by cytoscape anyway.
      const present = [...nodes.keys()];
      const relations = await this.prisma.$queryRawUnsafe<RelationRow[]>(
        `SELECT r.id, r."sourceEntityId", r."targetEntityId", r.type, r.description,
                r.evidence, r."documentId", r.confidence
         FROM "EntityRelation" r
         JOIN "Document" d ON d.id = r."documentId"
         WHERE d.status = 'completed'
           AND r."sourceEntityId" = ANY($1::text[])
           AND r."targetEntityId" = ANY($1::text[])`,
        present,
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

  async getRelationsForEntity(entityId: string) {
    const rows = await this.prisma.entityRelation.findMany({
      where: {
        OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
        document: { status: 'completed' },
      },
      select: {
        id: true,
        type: true,
        description: true,
        evidence: true,
        documentId: true,
        sourceEntityId: true,
        targetEntityId: true,
        source: { select: { id: true, displayName: true } },
        target: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const outgoing = row.sourceEntityId === entityId;
      const other = outgoing ? row.target : row.source;
      return {
        id: row.id,
        type: row.type,
        description: row.description,
        evidence: row.evidence,
        documentId: row.documentId,
        otherEntityId: other.id,
        otherEntityName: other.displayName,
        direction: outgoing ? ('out' as const) : ('in' as const),
      };
    });
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

/** pgvector's text input format: `[0.1,0.2,...]`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
