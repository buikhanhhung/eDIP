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
   * The wider passage meant to reach the model in place of `content`. Only the
   * hierarchical strategies set it.
   *
   * The read side already exists — both retrieval queries select
   * `COALESCE(parent_content, content)` — but `replaceChunks` does not yet
   * write the column, so a value set here is dropped on the way to the table.
   * Setting it is therefore pointless until that INSERT carries it.
   */
  parentContent?: string;
  /** Per-strategy provenance, persisted to the `metadata` column. */
  metadata?: Record<string, unknown>;
}

/**
 * Asynchronous even though three of the four strategies compute synchronously:
 * `SEMANTIC` has to embed sentences to find its boundaries, and a signature
 * that changes once every call site is written is a signature written twice.
 */
export type ChunkingStrategy = (text: string) => Promise<Chunk[]>;
