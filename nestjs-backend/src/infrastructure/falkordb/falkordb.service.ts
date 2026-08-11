import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FalkorDB, type Graph } from 'falkordb';
import type { EnvConfig } from '@config/env.config';
import type { CypherParams, IFalkorDbClient } from './falkordb.port';

/**
 * Graph names reach a Redis key path, so the configured value is checked
 * rather than trusted. Letters, digits and underscore only.
 */
const SAFE_GRAPH_NAME = /^[A-Za-z0-9_]{1,64}$/;

const DEFAULT_TIMEOUT_MS = 5_000;

@Injectable()
export class FalkorDbService implements IFalkorDbClient, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FalkorDbService.name);
  private client: FalkorDB | null = null;
  private readonly graphName: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.graphName = this.config.get('FALKORDB_GRAPH', { infer: true });
    if (!SAFE_GRAPH_NAME.test(this.graphName)) {
      throw new Error(`FALKORDB_GRAPH is not a safe graph name: ${this.graphName}`);
    }
  }

  /**
   * Connection failure is logged, not thrown. The graph is one feature of the
   * app; refusing to boot the API — and with it login, library and search —
   * because a secondary store is down would turn a degraded feature into an
   * outage.
   */
  async onModuleInit(): Promise<void> {
    const host = this.config.get('FALKORDB_HOST', { infer: true });
    const port = this.config.get('FALKORDB_PORT', { infer: true });

    try {
      this.client = await FalkorDB.connect({ socket: { host, port } });
      this.logger.log(`FalkorDB connected (host=${host} port=${port} graph=${this.graphName})`);
      await this.ensureSchema();
    } catch (error) {
      this.client = null;
      this.logger.error(
        `FalkorDB unavailable at ${host}:${port} — graph endpoints will fail until it is reachable: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Property indexes only. ECVBot also builds vector and fulltext indexes over
   * the graph because it retrieves through them; here retrieval still runs on
   * pgvector, so those indexes would be maintenance with no reader.
   */
  async ensureSchema(): Promise<void> {
    const statements = [
      'CREATE INDEX FOR (e:Entity) ON (e.id)',
      'CREATE INDEX FOR (e:Entity) ON (e.normalized_name)',
      'CREATE INDEX FOR (d:Document) ON (d.id)',
    ];

    for (const statement of statements) {
      try {
        await this.graph().query(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Re-running boot must be free; anything other than "it is already
        // there" is a real problem and propagates.
        if (!/already (?:indexed|exists)/i.test(message)) throw error;
      }
    }
  }

  /**
   * The deadline is set twice on purpose: `TIMEOUT` asks the server to abandon
   * the query, and the race abandons the wait. Server-side alone leaves a
   * caller hanging if the connection itself stalls; client-side alone lets the
   * graph keep burning cycles on a query nobody is waiting for.
   */
  async query<T = unknown>(
    cypher: string,
    params?: CypherParams,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<T[]> {
    const graph = this.graph();
    let timer: NodeJS.Timeout | undefined;

    try {
      const result = await Promise.race([
        // The SDK types params as its own QueryParams union; the cast is
        // confined to this one call rather than spread through the port.
        graph.query<T>(cypher, {
          TIMEOUT: timeoutMs,
          ...(params ? { params: params as never } : {}),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`FalkorDB query timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);

      return result.data ?? [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async deleteGraph(): Promise<void> {
    try {
      await this.graph().delete();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Deleting a graph that was never created is the desired end state.
      if (!/empty key|not found/i.test(message)) throw error;
    }
  }

  private graph(): Graph {
    if (!this.client) {
      throw new Error(
        'FalkorDB is not connected. Start it with `docker compose -f docker-compose.dev.yml up -d falkordb`.',
      );
    }
    return this.client.selectGraph(this.graphName);
  }
}
