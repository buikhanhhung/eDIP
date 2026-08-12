import type { DedupeAction } from './entity-dedup';
import type { EntityType } from './entity-normalizer';

/** Shaped for cytoscape directly, so the client does no mapping. */
export interface GraphNode {
  data: {
    id: string;
    label: string;
    type: string;
    /** How many completed documents mention this entity — drives node size. */
    documentCount: number;
    /** Relations touching this entity, for ranking when the cap bites. */
    degree: number;
    description?: string;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    /** The relationship the extractor read, e.g. `CUNG_CẤP_DỊCH_VỤ_CHO`. */
    label: string;
    /** The sentence it was read from, so the claim can be checked. */
    evidence: string;
    documentId: string;
    confidence?: number;
  };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Every relation type present before filtering, for the filter control. */
  relationTypes: string[];
  /** Entities that matched before the cap, so the UI can say "N of M". */
  totalNodes: number;
}

export interface GetGraphOptions {
  types?: readonly EntityType[];
  /** Restrict to these relationship labels. Empty or absent means all. */
  relationTypes?: readonly string[];
  /**
   * Minimum documents an entity must appear in to be drawn.
   *
   * The reach filter, and the reason there is no confidence filter: the model
   * scores every entity and every relation 1, measured twice, so a slider on
   * that would move without filtering anything. This one has real spread —
   * most entities occur in a single document.
   */
  minDocuments: number;
  /** Cap on nodes drawn; the densest are kept. */
  limit: number;
}

/**
 * The slice of a Postgres `Document` row the graph needs to filter and label
 * itself. Copied in rather than joined back: a node that cannot say whether it
 * is completed forces every read to reach into the other store.
 */
export interface DocumentProjection {
  id: string;
  title: string | null;
  filename: string;
  documentType: string | null;
  status: string;
}

/** A candidate produced by the extraction pipeline, before dedup. */
export interface EntityCandidate {
  name: string;
  type: EntityType;
  description?: string;
  /** Embedding of the name, or null when embedding was unavailable. */
  embedding?: number[] | null;
}

export interface ResolvedEntity {
  entityId: string;
  action: DedupeAction;
  reason: string;
}

/** One occurrence of an entity in a document, with its position if locatable. */
export interface EntityMention {
  mentionText: string;
  charStart: number | null;
  charEnd: number | null;
  confidence?: number | null;
}

export interface RelationInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  description: string;
  evidence: string;
  confidence?: number;
}

/**
 * Everything the application knows about the knowledge graph.
 *
 * The graph lives in FalkorDB and nowhere else — there is no Postgres table
 * behind these methods. `:Document` nodes are a projection of Postgres rows,
 * refreshed through `projectDocument`, which is why deleting a document has to
 * call `deleteDocument` as well: no foreign key spans the two stores.
 */
export interface IGraphStore {
  /** Creates or refreshes the document node. Call after any row change. */
  projectDocument(document: DocumentProjection): Promise<void>;

  /** Removes the node with its mentions and relations. */
  deleteDocument(documentId: string): Promise<void>;

  /**
   * Finds the entity this candidate belongs to, or creates one: exact key,
   * then nearest same-type neighbour above the similarity threshold.
   */
  resolveEntity(candidate: EntityCandidate): Promise<ResolvedEntity>;

  linkMention(
    documentId: string,
    entityId: string,
    mention: EntityMention,
  ): Promise<{ located: boolean }>;

  /** Drops a document's mentions, optionally only those of the given types. */
  unlinkMentions(documentId: string, types?: readonly EntityType[]): Promise<void>;

  /** Mentions in one document, for the detail page and its highlighting. */
  getEntitiesForDocument(documentId: string): Promise<
    {
      id: string;
      type: string;
      displayName: string;
      mentionText: string;
      charStart: number | null;
      charEnd: number | null;
      confidence: number | null;
    }[]
  >;

  /**
   * Replaces every relation extracted from this document. Purge-then-insert,
   * so re-running extraction cannot double an edge. `documentText` is passed
   * in because evidence offsets are measured against it here.
   */
  replaceRelations(
    documentId: string,
    documentText: string,
    relations: RelationInput[],
  ): Promise<number>;

  getGraph(options: GetGraphOptions): Promise<GraphPayload>;

  getDocumentsForEntity(entityId: string): Promise<
    { id: string; title: string | null; filename: string; documentType: string | null }[]
  >;

  /** Typed relations touching an entity, with their evidence. */
  getRelationsForEntity(entityId: string): Promise<
    {
      id: string;
      type: string;
      description: string;
      evidence: string;
      documentId: string;
      otherEntityId: string;
      otherEntityName: string;
      direction: 'out' | 'in';
    }[]
  >;
}
