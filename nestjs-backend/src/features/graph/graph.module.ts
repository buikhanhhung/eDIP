import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GRAPH_STORE } from './graph.di-token';
import { PostgresGraphStore } from './infras/postgres-graph.store';

@Module({
  controllers: [GraphController],
  // Day 2: point this at a FalkorDB adapter implementing the same interface.
  providers: [{ provide: GRAPH_STORE, useClass: PostgresGraphStore }],
  exports: [GRAPH_STORE],
})
export class GraphModule {}
