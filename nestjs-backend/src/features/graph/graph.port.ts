import type { DedupeAction } from './entity-dedup';
import type { EntityType } from './entity-normalizer';
import type { EntityMention } from './entity-linker';

/** Shaped for cytoscape directly, so the client does no mapping. */
export interface GraphNode {
  data: {
    id: string;
    label: string;
    kind: 'document' | 'entity';
    type?: string;
    documentCount?: number;
    description?: string;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    /** `mentions` is document→entity; `relates` is entity→entity. */
    kind: 'mentions' | 'relates';
    /** Relationship label, on `relates` edges only. */
    label?: string;
    /** The sentence this edge was read from, on `relates` edges only. */
    evidence?: string;
    documentId?: string;
    confidence?: number;
  };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GetGraphOptions {
  /** Minimum documents an entity must appear in to become a node. */
  minShared: number;
  types?: readonly EntityType[];
  /** Include typed entity→entity edges alongside the mention edges. */
  includeRelations?: boolean;
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

export interface RelationInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  description: string;
  evidence: string;
  confidence?: number;
}

export interface IGraphStore {
  upsertDocumentEntities(
    documentId: string,
    text: string,
    entities: EntityMention[],
  ): Promise<{ linked: number; withOffset: number }>;

  /**
   * Finds the entity this candidate belongs to, or creates one. Runs the exact
   * lookup and the nearest-neighbour lookup, then applies `decideDedupe`.
   */
  resolveEntity(candidate: EntityCandidate): Promise<ResolvedEntity>;

  /** Records that a document mentions an entity, with the offset if locatable. */
  linkMention(
    documentId: string,
    entityId: string,
    mentionText: string,
    documentText: string,
    confidence?: number,
  ): Promise<{ located: boolean }>;

  /**
   * Replaces every relation extracted from this document. Purge-then-insert,
   * so re-running extraction cannot double an edge.
   */
  replaceRelations(documentId: string, relations: RelationInput[]): Promise<number>;

  getGraph(options: GetGraphOptions): Promise<GraphPayload>;

  /** Entity nodes touching a document, for the click-through drawer. */
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

  /**
   * Unlinks a document's entities, optionally only those of the given types.
   * The type filter exists so re-deriving edited metadata replaces the links
   * that metadata produced without discarding facts the editor never touched.
   */
  deleteByDocument(documentId: string, types?: readonly EntityType[]): Promise<void>;
}
