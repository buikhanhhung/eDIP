import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { GRAPH_STORE } from './graph.di-token';
import { ENTITY_TYPES, type EntityType } from './entity-normalizer';
import type { IGraphStore } from './graph.port';

/**
 * Enough that no realistic corpus hits it during a demo, low enough that a
 * runaway extraction cannot hand the browser a canvas it will not finish
 * laying out.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

@Controller('graph')
export class GraphController {
  constructor(@Inject(GRAPH_STORE) private readonly graph: IGraphStore) {}

  @RequirePermission('view')
  @Get()
  getGraph(
    @Query('types') types?: string,
    @Query('relationTypes') relationTypes?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.graph.getGraph({
      types: parseTypes(types),
      relationTypes: parseCsv(relationTypes),
      limit:
        Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), MAX_LIMIT) : DEFAULT_LIMIT,
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

/** Relation labels are extractor output, so they are taken as given. */
function parseCsv(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}
