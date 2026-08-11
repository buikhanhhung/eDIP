/** Cypher bind parameters. Values are always bound, never interpolated. */
export type CypherParams = Record<string, unknown>;

/**
 * Public contract for the FalkorDB layer. Feature code injects
 * `FALKORDB_CLIENT` and codes against this interface rather than the SDK, so
 * the transport can change without rippling through callers.
 *
 * Single graph, unlike ECVBot's graph-per-organisation: eDIP has no tenants,
 * and inventing a tenant key to carry one graph would be ceremony that hides
 * nothing. The graph name still comes from configuration and is validated
 * before it reaches a key path.
 */
export interface IFalkorDbClient {
  /**
   * Idempotent bootstrap of indexes. Safe on every boot: the SDK's
   * "already indexed" response is swallowed, anything else propagates.
   */
  ensureSchema(): Promise<void>;

  /**
   * Parameterised Cypher with a client-side deadline. A wedged graph must not
   * pin an API worker, so the query races a timer rather than waiting forever.
   */
  query<T = unknown>(cypher: string, params?: CypherParams, timeoutMs?: number): Promise<T[]>;

  /** Drops the whole graph. Used by the sync script before a full rebuild. */
  deleteGraph(): Promise<void>;

  /** True when a connection is established — surfaced on the health check. */
  isConnected(): boolean;
}
