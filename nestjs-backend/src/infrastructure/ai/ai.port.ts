/**
 * The model capabilities this application needs, stated independently of who
 * provides them.
 *
 * Three capabilities, three interfaces — a provider that covers only some of
 * them can still be wired in for those, and the pipeline says exactly which
 * one it is missing rather than failing on a vendor name.
 */

/** Must match the pgvector column width and the FalkorDB vector index. */
export const EMBEDDING_DIMENSION = 1024;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /**
   * JSON Schema pinning the response shape.
   *
   * Every object needs `additionalProperties: false` and every property listed
   * in `required` — Bedrock tolerates looser schemas, OpenAI's strict mode
   * rejects them outright, so the stricter rule is the one worth following.
   */
  inputSchema: Record<string, unknown>;
}

export interface ILlmService {
  /** Plain completion, for answers meant to be read rather than parsed. */
  invokeText(messages: ChatMessage[], maxTokens?: number): Promise<string>;

  /**
   * A response guaranteed to match `tool.inputSchema`. Not "ask for JSON and
   * parse it": that failure mode — fences, prose around the object, a field
   * renamed — is what the schema-constrained path removes.
   */
  invokeWithToolUse<T>(tool: ToolSpec, messages: ChatMessage[]): Promise<T>;
}

export type EmbeddingInputType = 'search_document' | 'search_query';

export interface IEmbeddingService {
  /**
   * Always returns `EMBEDDING_DIMENSION`-wide vectors. Implementations check
   * this themselves: a mismatch surfaces here with the model name, rather than
   * as pgvector's "expected 1024 dimensions" three layers down.
   */
  generateEmbeddings(texts: string[], inputType?: EmbeddingInputType): Promise<number[][]>;
}

/** Formats every supported provider accepts. */
export type VisionImageFormat = 'png' | 'jpeg' | 'webp';

export interface VisionImage {
  bytes: Buffer;
  format: VisionImageFormat;
}

export interface IVisionService {
  /** Reads text off images. All pages go in one request for shared context. */
  transcribe(images: VisionImage[]): Promise<string>;
}
