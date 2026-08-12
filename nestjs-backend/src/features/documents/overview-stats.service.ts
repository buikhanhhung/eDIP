import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  delta,
  precedingWindow,
  toWindow,
  type OverviewRange,
  type Window,
} from './overview-range';

/** Past this many days a daily axis is unreadable, so the buckets become months. */
const MAX_DAILY_SPAN = 92;

/** A leaderboard is a short list. Past this it is a table nobody reads. */
const TOP_DOCUMENTS = 8;

/** Actions that mean somebody actually consumed a document. */
const USE_ACTIONS = ['document.view', 'document.download'];

/** Restricts a query to documents that arrived inside the window. */
function uploadedIn(window: Window): Prisma.DocumentWhereInput {
  return { uploadedAt: { gte: window.start, lt: window.end } };
}

/** Actions that are a question put to the corpus. */
const QUERY_ACTIONS = ['search.query', 'ask.query'];

/**
 * Everything the overview page draws, for one window of time.
 *
 * Every figure here obeys the same window, including the totals. A dashboard
 * where the tiles are all-time but the charts are filtered invites the reader
 * to compare two numbers that were never measuring the same thing.
 */
@Injectable()
export class OverviewStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(range: OverviewRange) {
    const window = toWindow(range);
    const previous = precedingWindow(window);

    const [current, prior, byType, byTextSource, bySource, series, usage, ai] = await Promise.all([
      this.totals(window),
      this.totals(previous),
      this.groupCount('documentType', window),
      this.groupCount('textSource', window),
      this.groupCount('source', window),
      this.timeSeries(window),
      this.usage(window),
      this.queryInsights(window),
    ]);

    return {
      range: { from: range.from, to: range.to, bucket: series.bucket },
      tiles: {
        total: delta(current.total, prior.total),
        processed: delta(current.completed, prior.completed),
        failed: delta(current.failed, prior.failed),
        processing: delta(current.processing, prior.processing),
        storageBytes: delta(current.bytes, prior.bytes),
      },
      byType,
      byTextSource,
      bySource,
      series: series.points,
      usage,
      ai,
    };
  }

  /** The five headline figures, in one pass over the window. */
  private async totals(window: Window) {
    const [aggregate, byStatus] = await Promise.all([
      this.prisma.document.aggregate({
        where: uploadedIn(window),
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.prisma.document.groupBy({
        by: ['status'],
        where: uploadedIn(window),
        _count: { _all: true },
      }),
    ]);

    const count = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      total: aggregate._count._all,
      bytes: aggregate._sum.sizeBytes ?? 0,
      completed: count('completed'),
      failed: count('failed'),
      // Anything accepted but not yet finished is in flight, whether it is
      // sitting in the queue or already being read.
      processing: count('processing') + count('uploaded'),
    };
  }

  /**
   * `source` is required, so it is grouped as-is. The other two are only known
   * once a document has been analysed, and a null there means "not yet" rather
   * than a bucket — counting it would invent an "Unclassified" slice that
   * shrinks as the queue drains.
   */
  private async groupCount(
    field: 'documentType' | 'textSource' | 'source',
    window: Window,
  ): Promise<Record<string, number>> {
    const rows = await this.prisma.document.groupBy({
      by: [field],
      where: {
        ...uploadedIn(window),
        ...(field === 'source' ? {} : { [field]: { not: null } }),
      },
      _count: { _all: true },
    });

    return Object.fromEntries(
      rows.map((row) => [(row as Record<string, unknown>)[field] ?? 'unknown', row._count._all]),
    ) as Record<string, number>;
  }

  /**
   * Uploads per bucket across the whole window, empty buckets included.
   *
   * `generate_series` supplies the axis rather than the data: a quiet Tuesday
   * is a real zero and has to occupy its own place, otherwise a gap in the
   * data silently becomes a shorter axis and the line lies about its slope.
   */
  private async timeSeries(window: Window) {
    const days = Math.round((window.end.getTime() - window.start.getTime()) / 86_400_000);
    const bucket: 'day' | 'month' = days > MAX_DAILY_SPAN ? 'month' : 'day';

    // `end` is exclusive, so the series stops at the last instant inside the
    // window. Truncating `end` itself would add an empty bucket for the day
    // after the one the reader asked for.
    const lastInstant = new Date(window.end.getTime() - 1);

    const rows = await this.prisma.$queryRaw<{ bucket: Date; uploaded: bigint; failed: bigint }[]>`
      SELECT slot.bucket,
             COUNT(d.id) AS uploaded,
             COUNT(d.id) FILTER (WHERE d.status = 'failed') AS failed
      FROM generate_series(
             date_trunc(${bucket}, ${window.start}::timestamptz, 'UTC'),
             date_trunc(${bucket}, ${lastInstant}::timestamptz, 'UTC'),
             ${`1 ${bucket}`}::interval
           ) AS slot(bucket)
      LEFT JOIN "Document" d
        -- Truncated in a named zone, not the session's: the range the caller
        -- asked for is a run of UTC days, and a server in another timezone must
        -- not shift every document into its neighbour's bucket.
        ON date_trunc(${bucket}, d."uploadedAt", 'UTC') = slot.bucket
       AND d."uploadedAt" >= ${window.start}
       AND d."uploadedAt" < ${window.end}
      GROUP BY slot.bucket
      ORDER BY slot.bucket
    `;

    return {
      bucket,
      points: rows.map((row) => ({
        date: row.bucket.toISOString().slice(0, 10),
        uploaded: Number(row.uploaded),
        failed: Number(row.failed),
      })),
    };
  }

  /**
   * Which documents people actually opened, and what types those were.
   *
   * Read off the audit trail rather than the corpus: "most used" is a fact
   * about readers, not about what happens to be stored. A type nobody opens
   * can still be the largest bucket in the library.
   */
  private async usage(window: Window) {
    const rows = await this.prisma.$queryRaw<
      { id: string; filename: string; title: string | null; documentType: string | null; uses: bigint }[]
    >`
      SELECT d.id, d.filename, d.title, d."documentType", COUNT(a.id) AS uses
      FROM "AuditLog" a
      JOIN "Document" d ON d.id = a."targetId"
      WHERE a.action = ANY(${USE_ACTIONS})
        AND a."createdAt" >= ${window.start}
        AND a."createdAt" < ${window.end}
      GROUP BY d.id, d.filename, d.title, d."documentType"
      ORDER BY uses DESC, d.filename
    `;

    const documents = rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      title: row.title,
      documentType: row.documentType,
      uses: Number(row.uses),
    }));

    // Rolled up here rather than in a second query: the same rows answer both
    // "which type is used most" and "which documents made it so".
    const byType = new Map<string, number>();
    for (const document of documents) {
      const type = document.documentType ?? 'unknown';
      byType.set(type, (byType.get(type) ?? 0) + document.uses);
    }

    return {
      byType: [...byType.entries()]
        .map(([type, uses]) => ({ type, uses }))
        .sort((a, b) => b.uses - a.uses),
      documents: documents.slice(0, TOP_DOCUMENTS),
    };
  }

  /**
   * What was asked of the corpus, and how fast it answered.
   *
   * `avgResponseMs` is null rather than zero when nothing in the window
   * carries a duration — timings only started being recorded when the audit
   * interceptor began measuring them, and an average over no samples is not a
   * fast system.
   */
  private async queryInsights(window: Window) {
    const rows = await this.prisma.$queryRaw<
      { action: string; queries: bigint; avg_ms: number | null }[]
    >`
      SELECT action,
             COUNT(*) AS queries,
             AVG((meta->>'durationMs')::numeric) FILTER (WHERE meta ? 'durationMs') AS avg_ms
      FROM "AuditLog"
      WHERE action = ANY(${QUERY_ACTIONS})
        AND "createdAt" >= ${window.start}
        AND "createdAt" < ${window.end}
      GROUP BY action
    `;

    const totalQueries = rows.reduce((sum, row) => sum + Number(row.queries), 0);
    const timed = rows.filter((row) => row.avg_ms !== null);
    const weighted = timed.reduce((sum, row) => sum + Number(row.avg_ms) * Number(row.queries), 0);
    const timedCount = timed.reduce((sum, row) => sum + Number(row.queries), 0);

    return {
      totalQueries,
      searches: Number(rows.find((row) => row.action === 'search.query')?.queries ?? 0),
      questions: Number(rows.find((row) => row.action === 'ask.query')?.queries ?? 0),
      avgResponseMs: timedCount > 0 ? Math.round(weighted / timedCount) : null,
    };
  }
}
