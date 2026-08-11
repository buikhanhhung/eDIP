import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FALKORDB_CLIENT } from '@infrastructure/falkordb/falkordb.di-token';
import type { IFalkorDbClient } from '@infrastructure/falkordb/falkordb.port';
import { decideDedupe, type VectorMatch } from '../entity-dedup';
import {
  GRAPH_ENTITY_TYPES,
  normalizeEntityName,
  type EntityType,
} from '../entity-normalizer';
import type {
  DocumentProjection,
  EntityCandidate,
  EntityMention,
  GetGraphOptions,
  GraphEdge,
  GraphNode,
  GraphPayload,
  IGraphStore,
  RelationInput,
  ResolvedEntity,
} from '../graph.port';

/** Neighbours pulled before the type filter is applied in TypeScript. */
const VECTOR_CANDIDATES = 5;

interface MentionRow {
  documentId: string;
  documentLabel: string;
  entityId: string;
  entityLabel: string;
  entityType: string;
  entityDescription: string | null;
  docCount: number;
}

/**
 * The knowledge graph, held entirely in FalkorDB.
 *
 * Entities, their mentions and the relations between them have no Postgres
 * table — this is their only home, as in ECVBot. What Postgres still owns is
 * the source record: the `Document` row, its text, its metadata. `:Document`
 * nodes here are a projection of those rows, carrying just enough (label,
 * status, type) for the graph to filter and label itself without a join back.
 *
 * The consequence to keep in mind: nothing enforces referential integrity
 * between the two stores. Deleting a document row must delete its node here
 * too, which `deleteDocument` does explicitly, because there is no cascade to
 * do it for us.
 */
@Injectable()
export class FalkorGraphStore implements IGraphStore {
  private readonly logger = new Logger(FalkorGraphStore.name);

  constructor(@Inject(FALKORDB_CLIENT) private readonly falkor: IFalkorDbClient) {}

  // ---- documents ----------------------------------------------------------

  async projectDocument(document: DocumentProjection): Promise<void> {
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

  /** Removes the node and, with it, every mention and relation hanging off it. */
  async deleteDocument(documentId: string): Promise<void> {
    await this.falkor.query(
      `MATCH ()-[r:RELATES {document_id: $documentId}]->() DELETE r`,
      { documentId },
    );
    await this.falkor.query(`MATCH (d:Document {id: $documentId}) DETACH DELETE d`, {
      documentId,
    });
    this.logger.log(`removed document ${documentId} from the graph`);
  }

  // ---- entities -----------------------------------------------------------

  async resolveEntity(candidate: EntityCandidate): Promise<ResolvedEntity> {
    const normalizedName = normalizeEntityName(candidate.name);
    if (!normalizedName) {
      throw new Error(`Entity name "${candidate.name}" normalises to nothing`);
    }

    const exactRows = await this.falkor.query<{ id: string }>(
      `MATCH (e:Entity {normalized_name: $normalizedName, type: $type}) RETURN e.id AS id LIMIT 1`,
      { normalizedName, type: candidate.type },
    );
    const exact = exactRows[0] ? { entityId: exactRows[0].id } : null;

    const nearest = exact ? null : await this.findNearestEntity(candidate);
    const plan = decideDedupe(
      { name: candidate.name, type: candidate.type },
      exact,
      nearest,
    );

    if (plan.action === 'REUSE') {
      if (candidate.description) {
        await this.falkor.query(
          `MATCH (e:Entity {id: $id}) SET e.description = $description`,
          { id: plan.matchedEntityId!, description: candidate.description },
        );
      }
      return { entityId: plan.matchedEntityId!, action: plan.action, reason: plan.reason };
    }

    if (plan.action === 'MERGE_AS_ALIAS') {
      // The canonical name is left alone: a merge must not rename the node
      // under everyone who already knows it. The absorbed spelling is recorded
      // so the merge can be inspected, and undone, later.
      await this.falkor.query(
        `MATCH (e:Entity {id: $id})
         SET e.aliases = CASE
           WHEN e.aliases IS NULL THEN [$alias]
           WHEN $alias IN e.aliases THEN e.aliases
           ELSE e.aliases + [$alias]
         END`,
        { id: plan.matchedEntityId!, alias: candidate.name.trim() },
      );
      this.logger.log(`merged "${candidate.name}" into ${plan.matchedEntityId} — ${plan.reason}`);
      return { entityId: plan.matchedEntityId!, action: plan.action, reason: plan.reason };
    }

    const id = randomUUID();
    await this.falkor.query(
      `CREATE (e:Entity {
         id: $id, type: $type, entity_name: $entityName,
         normalized_name: $normalizedName, description: $description, aliases: []
       })`,
      {
        id,
        type: candidate.type,
        entityName: candidate.name.trim(),
        normalizedName,
        description: candidate.description ?? null,
      },
    );

    if (candidate.embedding) {
      await this.falkor.query(
        `MATCH (e:Entity {id: $id}) SET e.name_embedding = vecf32($embedding)`,
        { id, embedding: candidate.embedding },
      );
    }

    return { entityId: id, action: plan.action, reason: plan.reason };
  }

  /**
   * Nearest same-type entity by name embedding.
   *
   * The index cannot filter by type, so candidates are pulled and filtered
   * here — a closer wrong-type neighbour must not hide the right one behind a
   * `LIMIT 1`. FalkorDB returns cosine distance; the dedup threshold is
   * expressed as similarity, hence `1 - score`.
   */
  private async findNearestEntity(candidate: EntityCandidate): Promise<VectorMatch | null> {
    if (!candidate.embedding) return null;

    try {
      const rows = await this.falkor.query<{ id: string; type: string; score: number }>(
        `CALL db.idx.vector.queryNodes('Entity', 'name_embedding', $k, vecf32($embedding))
         YIELD node, score
         RETURN node.id AS id, node.type AS type, score AS score`,
        { k: VECTOR_CANDIDATES, embedding: candidate.embedding },
      );

      const match = rows.find((row) => row.type === candidate.type);
      if (!match) return null;
      return { entityId: match.id, type: match.type, similarity: 1 - Number(match.score) };
    } catch (error) {
      // An empty or missing vector index is not a failure worth losing the
      // extraction over: dedup falls back to exact-name matching, which
      // produces duplicates a human can merge.
      this.logger.warn(`vector dedup lookup failed, falling back to exact match: ${(error as Error).message}`);
      return null;
    }
  }

  async linkMention(
    documentId: string,
    entityId: string,
    mention: EntityMention,
  ): Promise<{ located: boolean }> {
    await this.falkor.query(
      `MATCH (d:Document {id: $documentId}), (e:Entity {id: $entityId})
       MERGE (d)-[m:MENTIONS {mention_text: $mentionText}]->(e)
       SET m.char_start = $charStart, m.char_end = $charEnd, m.confidence = $confidence`,
      {
        documentId,
        entityId,
        mentionText: mention.mentionText,
        charStart: mention.charStart,
        charEnd: mention.charEnd,
        confidence: mention.confidence ?? null,
      },
    );
    return { located: mention.charStart !== null };
  }

  async unlinkMentions(documentId: string, types?: readonly EntityType[]): Promise<void> {
    if (types) {
      await this.falkor.query(
        `MATCH (:Document {id: $documentId})-[m:MENTIONS]->(e:Entity)
         WHERE e.type IN $types DELETE m`,
        { documentId, types: [...types] },
      );
      return;
    }
    await this.falkor.query(`MATCH (:Document {id: $documentId})-[m:MENTIONS]->() DELETE m`, {
      documentId,
    });
  }

  async getEntitiesForDocument(documentId: string) {
    return this.falkor.query<{
      id: string;
      type: string;
      displayName: string;
      mentionText: string;
      charStart: number | null;
      charEnd: number | null;
      confidence: number | null;
    }>(
      `MATCH (:Document {id: $documentId})-[m:MENTIONS]->(e:Entity)
       RETURN e.id AS id, e.type AS type, e.entity_name AS displayName,
              m.mention_text AS mentionText, m.char_start AS charStart,
              m.char_end AS charEnd, m.confidence AS confidence
       ORDER BY m.char_start`,
      { documentId },
    );
  }

  // ---- relations ----------------------------------------------------------

  async replaceRelations(
    documentId: string,
    documentText: string,
    relations: RelationInput[],
  ): Promise<number> {
    await this.falkor.query(
      `MATCH ()-[r:RELATES {document_id: $documentId}]->() DELETE r`,
      { documentId },
    );
    if (relations.length === 0) return 0;

    let written = 0;
    for (const relation of relations) {
      // Self-loops carry no information and clutter the canvas.
      if (relation.sourceEntityId === relation.targetEntityId) continue;

      // The evidence position is measured here, never taken from the model.
      const evidenceStart = documentText.indexOf(relation.evidence);

      await this.falkor.query(
        `MATCH (a:Entity {id: $sourceId}), (b:Entity {id: $targetId})
         MERGE (a)-[r:RELATES {document_id: $documentId, type: $type}]->(b)
         SET r.id = $id, r.description = $description, r.evidence = $evidence,
             r.evidence_start = $evidenceStart, r.evidence_end = $evidenceEnd,
             r.confidence = $confidence`,
        {
          id: randomUUID(),
          sourceId: relation.sourceEntityId,
          targetId: relation.targetEntityId,
          documentId,
          type: relation.type,
          description: relation.description,
          evidence: relation.evidence,
          evidenceStart: evidenceStart >= 0 ? evidenceStart : null,
          evidenceEnd: evidenceStart >= 0 ? evidenceStart + relation.evidence.length : null,
          confidence: relation.confidence ?? null,
        },
      );
      written += 1;
    }

    this.logger.log(`wrote ${written} relations for ${documentId}`);
    return written;
  }

  // ---- reads --------------------------------------------------------------

  async getGraph({ minShared, types, includeRelations }: GetGraphOptions): Promise<GraphPayload> {
    const allowed = [...((types ?? GRAPH_ENTITY_TYPES) as readonly EntityType[])];

    // One aggregation over a path pattern, where the SQL version needed a CTE
    // and three joins.
    const rows = await this.falkor.query<MentionRow>(
      `MATCH (d:Document {status: 'completed'})-[:MENTIONS]->(e:Entity)
       WHERE e.type IN $types
       WITH e, count(DISTINCT d) AS docCount
       WHERE docCount >= $minShared
       MATCH (doc:Document {status: 'completed'})-[:MENTIONS]->(e)
       RETURN DISTINCT doc.id AS documentId, doc.label AS documentLabel,
              e.id AS entityId, e.entity_name AS entityLabel, e.type AS entityType,
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

      // Keyed by the pair: a document mentioning one entity under two
      // spellings is two MENTIONS edges but one line on the canvas, and two
      // edges sharing an id blank cytoscape.
      const id = `${row.documentId}__${row.entityId}`;
      edges.set(id, {
        data: { id, source: row.documentId, target: row.entityId, kind: 'mentions' },
      });
    }

    if (includeRelations) {
      /**
       * Relations are not restricted to entities that survived `minShared`.
       *
       * That filter asks "does this entity tie documents together", which is a
       * different question from "did the extractor find a stated relationship".
       * Applying it to relations hid five of seven edges behind the default
       * setting, so turning the feature on appeared to do nothing. Endpoints
       * missing from the mention pass are added as nodes here.
       */
      const relations = await this.falkor.query<{
        id: string;
        sourceEntityId: string;
        targetEntityId: string;
        sourceLabel: string;
        sourceType: string;
        targetLabel: string;
        targetType: string;
        type: string;
        evidence: string;
        documentId: string;
        confidence: number | null;
      }>(
        `MATCH (a:Entity)-[r:RELATES]->(b:Entity)
         MATCH (d:Document {id: r.document_id, status: 'completed'})
         WHERE a.type IN $types AND b.type IN $types
         RETURN r.id AS id, a.id AS sourceEntityId, b.id AS targetEntityId,
                a.entity_name AS sourceLabel, a.type AS sourceType,
                b.entity_name AS targetLabel, b.type AS targetType,
                r.type AS type, r.evidence AS evidence,
                r.document_id AS documentId, r.confidence AS confidence`,
        { types: allowed },
      );

      for (const relation of relations) {
        for (const end of [
          { id: relation.sourceEntityId, label: relation.sourceLabel, type: relation.sourceType },
          { id: relation.targetEntityId, label: relation.targetLabel, type: relation.targetType },
        ]) {
          if (!nodes.has(end.id)) {
            nodes.set(end.id, {
              data: { id: end.id, label: end.label, kind: 'entity', type: end.type },
            });
          }
        }

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
              other.entity_name AS otherEntityName, 'out' AS direction
       UNION
       MATCH (other:Entity)-[r:RELATES]->(e:Entity {id: $entityId})
       RETURN r.id AS id, r.type AS type, r.description AS description, r.evidence AS evidence,
              r.document_id AS documentId, other.id AS otherEntityId,
              other.entity_name AS otherEntityName, 'in' AS direction`,
      { entityId },
    );

    return rows.map((row) => ({
      ...row,
      direction: row.direction === 'out' ? ('out' as const) : ('in' as const),
    }));
  }
}
