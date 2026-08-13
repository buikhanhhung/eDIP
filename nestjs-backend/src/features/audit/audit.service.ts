import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  delta,
  precedingWindow,
  toWindow,
  type OverviewRange,
  type Window,
} from '@features/documents/overview-range';

const MAX_TAKE = 200;

const DEFAULT_TAKE = 50;

/** A document arrived, whichever door it came through. */
const ADDED_ACTIONS = ['document.upload', 'document.import'];

/** How many documents a free-text search may resolve to before it is a dump. */
const MAX_NAME_MATCHES = 500;

/** Columns safe to send to the log view — never the whole `meta` of a body. */
const ROW_SELECT = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  meta: true,
  createdAt: true,
  actor: { select: { id: true, email: true, role: true } },
} satisfies Prisma.AuditLogSelect;

export interface AuditQuery {
  /** The window every figure and every row on the page obeys. */
  range: OverviewRange;
  /** The part of an action before the dot — `document`, `search`, `ask`. */
  category?: string;
  /** One exact action, e.g. `document.delete`. Narrower than `category`. */
  action?: string;
  actorId?: string;
  /** Free text, matched against the columns the table actually shows. */
  q?: string;
  take?: number;
  skip?: number;
}

/**
 * Read side of the audit trail. Writing is the interceptor's job, so there is
 * no method here that could be called to fabricate an entry.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQuery) {
    const where = buildWhere(query, await this.documentsNamed(query.q));

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(query.take ?? DEFAULT_TAKE, MAX_TAKE),
        skip: query.skip ?? 0,
        select: ROW_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, targetNames: await this.targetNames(items) };
  }

  /**
   * The headline figures for the window, plus the values worth offering as
   * filters.
   *
   * Separate from the list because it answers a different question: these
   * describe the whole window, whatever the table happens to be filtered to.
   * Narrowing the table to searches must not report that nobody asked the AI
   * anything.
   */
  async summary(range: OverviewRange) {
    const window = toWindow(range);

    const [current, prior, actors, actions] = await Promise.all([
      this.countsIn(window),
      this.countsIn(precedingWindow(window)),
      this.actors(),
      this.actions(),
    ]);

    return {
      tiles: {
        total: delta(current.total, prior.total),
        added: delta(current.added, prior.added),
        searches: delta(current.searches, prior.searches),
        questions: delta(current.questions, prior.questions),
      },
      actors,
      actions,
    };
  }

  /** Every tile in one pass: the log is grouped once and read four ways. */
  private async countsIn(window: Window) {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: window.start, lt: window.end } },
      _count: { _all: true },
    });

    const count = (...names: string[]) =>
      rows
        .filter((row) => names.includes(row.action))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      added: count(...ADDED_ACTIONS),
      searches: count('search.query'),
      questions: count('ask.query'),
    };
  }

  /**
   * The name behind each `targetId` on this page, resolved in one pass.
   *
   * There is no relation to follow — `targetId` is a loose string precisely so
   * a row outlives the thing it describes — so the ids are looked up
   * separately. A document that has since been deleted simply has no name
   * here, which is the honest answer for the row that deleted it.
   */
  private async targetNames(
    rows: { targetType: string | null; targetId: string | null }[],
  ): Promise<Record<string, string>> {
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          row.targetType === 'document' && row.targetId ? [row.targetId] : [],
        ),
      ),
    ];
    if (ids.length === 0) return {};

    const documents = await this.prisma.document.findMany({
      where: { id: { in: ids } },
      select: { id: true, filename: true, title: true },
    });

    return Object.fromEntries(
      documents.map((document) => [
        document.id,
        document.title ?? document.filename,
      ]),
    );
  }

  /**
   * Documents whose name matches the search text, so typing what the target
   * column shows finds the rows that show it.
   *
   * The column holds a filename, but the row holds only an id, and there is no
   * relation to filter through — so the names are turned into ids first. Capped
   * because past a few hundred matches the reader is describing the library
   * rather than looking for a row in the log.
   */
  private async documentsNamed(q?: string): Promise<string[] | undefined> {
    if (!q) return undefined;

    const documents = await this.prisma.document.findMany({
      where: {
        OR: [
          { filename: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: MAX_NAME_MATCHES,
    });

    return documents.map((document) => document.id);
  }

  /**
   * Only people who have actually done something appear in the filter — every
   * account would offer options that can only ever match nothing.
   *
   * Deliberately not scoped to the window: a dropdown that empties as the dates
   * change would strand a selection the reader can no longer see or clear.
   */
  private async actors() {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['actorId'],
      where: { actorId: { not: null } },
      _count: { _all: true },
    });

    return this.prisma.user.findMany({
      where: {
        id: { in: rows.flatMap((row) => (row.actorId ? [row.actorId] : [])) },
      },
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  /** The actions the log actually holds, so the dropdown carries no dead options. */
  private async actions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      _count: { _all: true },
      orderBy: { action: 'asc' },
    });

    return rows.map((row) => row.action);
  }
}

/** `namedTargets` is the ids of documents matching `query.q`, or undefined when
 *  nothing was searched for. */
function buildWhere(
  query: AuditQuery,
  namedTargets?: string[],
): Prisma.AuditLogWhereInput {
  const window = toWindow(query.range);
  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: window.start, lt: window.end },
  };

  // An exact action already names its category, so the narrower of the two
  // wins rather than both being applied and contradicting each other.
  if (query.action) where.action = query.action;
  else if (query.category) where.action = { startsWith: `${query.category}.` };

  if (query.actorId) where.actorId = query.actorId;

  if (query.q) {
    where.OR = [
      { action: { contains: query.q, mode: 'insensitive' } },
      { actor: { email: { contains: query.q, mode: 'insensitive' } } },
      // The query text, which is what the target column shows for a search or
      // a question. Case-sensitive, unlike the rest: a JSON path filter has no
      // insensitive mode, and matching the visible text beats not matching it.
      { meta: { path: ['q'], string_contains: query.q } },
      ...(namedTargets && namedTargets.length > 0
        ? [
            {
              targetId: { in: namedTargets },
            } satisfies Prisma.AuditLogWhereInput,
          ]
        : []),
    ];
  }

  return where;
}
