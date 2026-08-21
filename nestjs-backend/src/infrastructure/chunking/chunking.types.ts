import type { IEmbeddingService } from '@infrastructure/ai/ai.port';

/**
 * The four strategies a document can be chunked with, chosen at upload.
 *
 * This list is the single source for the API's accepted values, the registry's
 * keys and the labels shown on the upload page — a strategy added here without
 * a registered implementation is caught by `chunking.service.spec.ts`.
 */
export const CHUNKING_STRATEGIES = [
  'RECURSIVE_CHARACTER',
  'PARENT_CHILD_MARKDOWN',
  'DOCUMENT_STRUCTURE',
  'SEMANTIC',
] as const;

export type ChunkingStrategyId = (typeof CHUNKING_STRATEGIES)[number];

/** What a document gets when the uploader expresses no preference. */
export const DEFAULT_CHUNKING_STRATEGY: ChunkingStrategyId = 'RECURSIVE_CHARACTER';

export interface Chunk {
  /** The text that gets embedded. */
  content: string;
  /**
   * The wider passage returned to the model in place of `content`, set only by
   * the hierarchical strategies. Both retrieval queries select
   * `COALESCE(parent_content, content)`, so a chunk is found by its own text
   * but answered with the wider passage.
   *
   * Leave it unset where it would merely repeat `content`: the COALESCE would
   * return the same string either way, and the row would hold it twice.
   */
  parentContent?: string;
  /**
   * Per-strategy provenance — which section a chunk came from, and the like.
   * Persisted as JSON. Nothing reads it back yet: it exists so a stored chunk
   * can say which strategy produced it and where it sat in the document.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Asynchronous even though three of the four strategies compute synchronously:
 * `SEMANTIC` has to embed sentences to find its boundaries, and a signature
 * that changes once every call site is written is a signature written twice.
 *
 * The embedding service is passed in rather than imported, so only the strategy
 * that needs it depends on it and the other three stay pure functions of their
 * text. They declare one parameter and ignore the second, which TypeScript
 * accepts — a narrower function is assignable to a wider signature.
 */
export type ChunkingStrategy = (text: string, embeddings?: IEmbeddingService) => Promise<Chunk[]>;
