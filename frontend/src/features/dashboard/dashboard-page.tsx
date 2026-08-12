import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Search,
  Timer,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaTrend } from '@/components/charts/area-trend';
import { BarList } from '@/components/charts/bar-list';
import { DonutChart, type Slice } from '@/components/charts/donut-chart';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { typeLabel, type OverviewStats } from '@/features/documents/document-types';

/**
 * Validated with the data-viz palette checker against a white surface: worst
 * adjacent CVD ΔE 11.5, worst normal-vision ΔE 19.2. Three slots fall below 3:1
 * contrast, which the legend's labels and values relieve.
 *
 * The order is fixed and colour follows the document type, so filtering the
 * corpus never repaints the types that remain.
 */
const TYPE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ec4899', '#f59e0b'] as const;

/** How the text was obtained, in words rather than column values. */
const TEXT_SOURCE_LABELS: Record<string, string> = {
  native: 'Read directly',
  pdf_text: 'PDF text layer',
  docx: 'Word document',
  xlsx: 'Spreadsheet',
  pptx: 'Presentation',
  vision: 'Vision (scan or image)',
};

/** Which door a document came through. */
const SOURCE_LABELS: Record<string, string> = {
  upload: 'Direct upload',
  google_drive: 'Google Drive',
};

const DEFAULT_RANGE_DAYS = 30;

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>(() => rangeFor(DEFAULT_RANGE_DAYS));

  const { data, isLoading, isError } = useQuery({
    // The window is part of the key, so changing it refetches rather than
    // showing the previous window's figures under the new dates.
    queryKey: ['overview', range.from, range.to],
    queryFn: async () =>
      (await apiClient.get<OverviewStats>('/stats', { params: range })).data,
  });

  const spanDays =
    Math.round(
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const comparison = `vs previous ${spanDays} days`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          icon={LayoutDashboard}
          title="Overview"
          description="Track document processing and platform usage."
        />
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {isLoading && <p className="text-sm text-text-sub-600">Loading statistics…</p>}
      {(isError || (!isLoading && !data)) && (
        <p className="text-sm text-danger-base">Could not load the overview statistics.</p>
      )}

      {data && <Overview data={data} comparison={comparison} />}
    </div>
  );
}

function Overview({ data, comparison }: { data: OverviewStats; comparison: string }) {
  const typeSlices: Slice[] = Object.entries(data.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TYPE_COLORS.length)
    .map(([type, count], index) => ({
      key: type,
      label: typeLabel(type),
      value: count,
      color: TYPE_COLORS[index],
    }));

  const documentTotal = Object.values(data.byType).reduce((sum, count) => sum + count, 0);

  const textSourceRows = labelledRows(data.byTextSource, TEXT_SOURCE_LABELS);
  const sourceRows = labelledRows(data.bySource, SOURCE_LABELS);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          icon={FileText}
          tone="blue"
          label="Total documents"
          value={String(data.tiles.total.value)}
          delta={data.tiles.total}
          comparison={comparison}
        />
        <StatTile
          icon={CheckCircle2}
          tone="green"
          label="Processed"
          value={String(data.tiles.processed.value)}
          delta={data.tiles.processed}
          comparison={comparison}
        />
        <StatTile
          icon={AlertCircle}
          tone="red"
          label="Failed"
          value={String(data.tiles.failed.value)}
          delta={data.tiles.failed}
          inverse
          comparison={comparison}
        />
        <StatTile
          icon={Clock}
          tone="violet"
          label="Processing"
          value={String(data.tiles.processing.value)}
          delta={data.tiles.processing}
          comparison={comparison}
        />
        <StatTile
          icon={FolderOpen}
          tone="amber"
          label="Storage used"
          value={formatBytes(data.tiles.storageBytes.value)}
          delta={data.tiles.storageBytes}
          comparison={comparison}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Documents uploaded over time</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaTrend
            points={data.series.map((point) => ({ date: point.date, value: point.uploaded }))}
            bucket={data.range.bucket}
            unit={data.series.length > 0 ? 'uploaded' : ''}
          />
        </CardContent>
      </Card>

      {/* Three to a row, and cards stretch to the tallest in their row. Letting
          each card size to its own content is what left the grid ragged. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-baseline justify-between pb-2">
            <CardTitle>Documents by type</CardTitle>
            <CardLink to="/library">View all</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            {typeSlices.length > 0 ? (
              // "classified", not "documents": a file that failed before the
              // classifier ran has no type, so this total can sit below the
              // one in the tile above without either being wrong.
              <DonutChart slices={typeSlices} total={documentTotal} totalLabel="classified" />
            ) : (
              <p className="text-sm text-text-sub-600">
                No documents were classified in this window.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="flex-row items-baseline justify-between pb-2">
            <CardTitle>Top data sources</CardTitle>
            <CardLink to="/sources">Manage</CardLink>
          </CardHeader>
          <CardContent className="flex-1">
            <BarList
              rows={sourceRows}
              showPercent
              layout="stacked"
              empty="Nothing was ingested in this window."
            />
            {/* Only connected providers appear. A row of zeros for a connector
                nobody set up would read as a service that is failing. */}
            <p className="mt-4 border-t border-stroke-soft-200 pt-3 text-xs text-text-soft-400">
              Providers appear once they have contributed a document.
            </p>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle>How the text was read</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <BarList rows={textSourceRows} empty="Nothing has been processed yet." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <MostUsedCard usage={data.usage} />
        <TokenUsageCard tokens={data.tokens} />
        <QueryInsightsCard ai={data.ai} />
      </div>
    </>
  );
}

/**
 * Which types people actually open, and the documents behind the winner.
 *
 * Read off the audit trail, not the library: a type can dominate the corpus and
 * still be the one nobody opens. Selecting a type filters the leaderboard
 * beneath it, which is what makes the headline figure checkable rather than
 * something the reader has to take on trust.
 */
function MostUsedCard({ usage }: { usage: OverviewStats['usage'] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const rows = usage.byType.map((row) => ({
    key: row.type,
    label: typeLabel(row.type === 'unknown' ? null : row.type),
    value: row.uses,
  }));

  const active = selected ?? usage.byType[0]?.type ?? null;
  const documents = usage.documents.filter(
    (document) => (document.documentType ?? 'unknown') === active,
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle>Most-used document types</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-text-sub-600">
            No document was opened, downloaded or cited in this window.
          </p>
        ) : (
          <>
            <BarList
              rows={rows}
              showPercent
              layout="stacked"
              onSelect={(key) => setSelected(key)}
              selectedKey={active}
            />

            <div className="border-t border-stroke-soft-200 pt-3">
              <p className="mb-2 text-subheading-xs uppercase text-text-soft-400">
                Most used · {typeLabel(active === 'unknown' ? null : active)}
              </p>
              {documents.length === 0 ? (
                <p className="text-sm text-text-sub-600">
                  No individual documents of this type made the top list.
                </p>
              ) : (
                <ul className="space-y-1">
                  {documents.map((document) => (
                    <li key={document.id}>
                      <Link
                        to={`/documents/${document.id}`}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-default hover:bg-bg-weak-50"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-text-strong-950">
                          {document.title ?? document.filename}
                        </span>
                        {/* "uses", not "opens": a use is a view, a download or
                            an answer quoting the document. */}
                        <span className="shrink-0 text-xs tabular-nums text-text-sub-600">
                          {document.uses} {document.uses === 1 ? 'use' : 'uses'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** What each kind of model call is for, in words rather than enum values. */
const PURPOSE_LABELS: Record<string, string> = {
  answer: 'AI answers',
  analysis: 'Document analysis',
  entities: 'Entity extraction',
  vision: 'Vision (scans, images)',
  embedding: 'Embeddings',
};

/**
 * Where the model budget went, split by the job rather than by the model.
 *
 * "Answering questions costs more than reading scans" is something a reader can
 * act on. "gemini-3.5-flash-lite costs everything" is not — one model does
 * every job here.
 *
 * A purpose whose provider reports no token counts shows the characters it
 * sent instead, marked as such. Presenting an unmeasured call as zero tokens
 * would read as a free one.
 */
function TokenUsageCard({ tokens }: { tokens: OverviewStats['tokens'] }) {
  const rows = tokens.byPurpose.map((row) => ({
    key: row.purpose,
    label: PURPOSE_LABELS[row.purpose] ?? row.purpose,
    value: row.inputTokens + row.outputTokens,
    unmeasured: row.reportedCalls === 0,
    chars: row.inputChars,
    calls: row.calls,
  }));

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-baseline justify-between pb-2">
        <CardTitle>Token usage</CardTitle>
        <span className="text-sm font-normal tabular-nums text-text-sub-600">
          {compact(tokens.totalInput + tokens.totalOutput)} total
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between">
        {rows.length === 0 ? (
          <p className="text-sm text-text-sub-600">No model calls in this window.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.key} className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-sub-600">
                      {row.label}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-text-strong-950">
                      {row.unmeasured ? `${compact(row.chars)} chars` : compact(row.value)}
                    </span>
                  </div>
                  {/* An unmeasured purpose gets an empty track. A filled bar
                      would place it on the same scale as the measured ones,
                      and a full-width one would read as the largest. */}
                  <span className="block h-2 overflow-hidden rounded-full bg-bg-soft-200">
                    {!row.unmeasured && (
                      <span
                        className="block h-full rounded-full bg-primary-base"
                        style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
                      />
                    )}
                  </span>
                  <p className="text-[11px] text-text-soft-400">
                    {row.calls} {row.calls === 1 ? 'call' : 'calls'}
                    {row.unmeasured && ' · provider reports no token counts'}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-4 border-t border-stroke-soft-200 pt-3 text-xs text-text-soft-400">
              {compact(tokens.totalInput)} in · {compact(tokens.totalOutput)} out across{' '}
              {tokens.calls} {tokens.calls === 1 ? 'call' : 'calls'}
              {tokens.unreportedCalls > 0 && `, ${tokens.unreportedCalls} unmeasured`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What was asked of the corpus, and how fast it answered.
 *
 * No unique-user figure: this deployment has one account, and a tile that
 * always reads "1" is furniture.
 */
function QueryInsightsCard({ ai }: { ai: OverviewStats['ai'] }) {
  const rows = [
    { icon: Activity, label: 'Total queries', value: String(ai.totalQueries) },
    { icon: Search, label: 'Searches', value: String(ai.searches) },
    { icon: MessageSquare, label: 'AI questions', value: String(ai.questions) },
    {
      icon: Timer,
      label: 'Avg. response time',
      // Null rather than zero when nothing in the window was timed — an
      // average over no samples is not a fast system.
      value: ai.avgResponseMs === null ? 'Not measured yet' : formatDuration(ai.avgResponseMs),
    },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-baseline justify-between pb-2">
        <CardTitle>AI query insights</CardTitle>
        <CardLink to="/audit">Activity log</CardLink>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="divide-y divide-stroke-soft-200">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-bg-weak-50 text-text-sub-600">
                <row.icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-sub-600">{row.label}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-text-strong-950">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CardLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 text-sm font-normal text-primary-base hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function labelledRows(counts: Record<string, number>, labels: Record<string, string>) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: labels[key] ?? key, value }));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Thousands and millions, so a token count stays readable beside a label. */
function compact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
