import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { GRAPH_STORE } from './graph.di-token';
import { ENTITY_TYPES, type EntityType } from './entity-normalizer';
import type { IGraphStore } from './graph.port';

/**
 * `minShared` defaults to 1 at the API and 2 in the interface — eDIP v1 split
 * these deliberately. A caller asking for the raw graph gets everything; the
 * demo view stays readable.
 */
const DEFAULT_MIN_SHARED = 1;

@Controller('graph')
export class GraphController {
  constructor(@Inject(GRAPH_STORE) private readonly graph: IGraphStore) {}

  @RequirePermission('view')
  @Get()
  getGraph(
    @Query('minShared') minShared?: string,
    @Query('types') types?: string,
    @Query('relations') relations?: string,
  ) {
    const parsed = Number(minShared);
    return this.graph.getGraph({
      minShared: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MIN_SHARED,
      types: parseTypes(types),
      // Off unless asked: typed edges are only present for documents that went
      // through extraction, and a canvas mixing "no relations here" with
      // "relations not requested" is unreadable.
      includeRelations: relations === 'true' || relations === '1',
    });
  }

  @RequirePermission('view')
  @Get('entities/:id/documents')
  getDocuments(@Param('id') id: string) {
    return this.graph.getDocumentsForEntity(id);
  }

  /** Typed relations touching an entity, each with the sentence behind it. */
  @RequirePermission('view')
  @Get('entities/:id/relations')
  getRelations(@Param('id') id: string) {
    return this.graph.getRelationsForEntity(id);
  }
}

/** Unknown names are dropped rather than rejected: a stale bookmark still works. */
function parseTypes(raw?: string): EntityType[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is EntityType => (ENTITY_TYPES as readonly string[]).includes(value));
  return requested.length > 0 ? requested : undefined;
}
