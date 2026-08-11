import { Module } from '@nestjs/common';
import { FalkorDbModule } from '@infrastructure/falkordb/falkordb.module';
import { GraphController } from './graph.controller';
import { GRAPH_STORE } from './graph.di-token';
import { FalkorGraphStore } from './infras/falkor-graph.store';

/**
 * One store, because the graph has one home. The token stays so callers depend
 * on the interface rather than the class — swapping in another graph database
 * means adding a sibling in `infras/` and changing this line.
 */
@Module({
  imports: [FalkorDbModule],
  controllers: [GraphController],
  providers: [{ provide: GRAPH_STORE, useClass: FalkorGraphStore }],
  exports: [GRAPH_STORE],
})
export class GraphModule {}
