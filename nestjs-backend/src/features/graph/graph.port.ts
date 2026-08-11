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
  };
}

export interface GraphEdge {
  data: { id: string; source: string; target: string };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GetGraphOptions {
  /** Minimum documents an entity must appear in to become a node. */
  minShared: number;
  types?: readonly EntityType[];
}

export interface IGraphStore {
  upsertDocumentEntities(
    documentId: string,
    text: string,
    entities: EntityMention[],
  ): Promise<{ linked: number; withOffset: number }>;

  getGraph(options: GetGraphOptions): Promise<GraphPayload>;

  /** Entity nodes touching a document, for the click-through drawer. */
  getDocumentsForEntity(entityId: string): Promise<
    { id: string; title: string | null; filename: string; documentType: string | null }[]
  >;

  /**
   * Unlinks a document's entities, optionally only those of the given types.
   * The type filter exists so re-deriving edited metadata replaces the links
   * that metadata produced without discarding facts the editor never touched.
   */
  deleteByDocument(documentId: string, types?: readonly EntityType[]): Promise<void>;
}
