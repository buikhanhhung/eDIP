import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import { FalkorDbModule } from '@infrastructure/falkordb/falkordb.module';
import { GraphController } from './graph.controller';
import { GRAPH_STORE } from './graph.di-token';
import { FalkorGraphStore } from './infras/falkor-graph.store';
import { PostgresGraphStore } from './infras/postgres-graph.store';

/**
 * The driver is chosen at boot from `GRAPH_STORE_DRIVER`, not at build time,
 * so the two implementations can be compared against the same data by
 * restarting with one variable changed — which is the only way to tell whether
 * the Cypher version really returns what the SQL version returns.
 */
@Module({
  imports: [FalkorDbModule],
  controllers: [GraphController],
  providers: [
    PostgresGraphStore,
    FalkorGraphStore,
    {
      provide: GRAPH_STORE,
      inject: [ConfigService, PostgresGraphStore, FalkorGraphStore],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        postgres: PostgresGraphStore,
        falkor: FalkorGraphStore,
      ) => {
        const driver = config.get('GRAPH_STORE_DRIVER', { infer: true });
        new Logger('GraphModule').log(`graph store driver: ${driver}`);
        return driver === 'falkordb' ? falkor : postgres;
      },
    },
  ],
  exports: [GRAPH_STORE],
})
export class GraphModule {}
