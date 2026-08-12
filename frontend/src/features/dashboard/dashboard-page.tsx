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
import { DonutChart, type Slice } from '@/components/charts/donut-chart';
import {
  GroupedColumns,
  type ColumnGroup,
  type ColumnSeries,
} from '@/components/charts/grouped-columns';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { StatTile, TILE_TONES } from '@/components/stat-tile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { typeColor, typeLabel, type OverviewStats } from '@/features/documents/document-types';

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
    .map(([type, count]) => ({
      key: type,
      label: typeLabel(type),
      value: count,
      color: typeColor(type),
    }));

  const documentTotal = Object.values(data.byType).reduce((sum, count) => sum + count, 0);

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

      {/* Aligned at the top, ending where their content ends. Stretching each
          card to the tallest in its row is what left pale gaps under the
          shorter ones. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-baseline justify-between pb-2">
            <CardTitle>Documents by type</CardTitle>
            <CardLink to="/library">View all</CardLink>
          </CardHeader>
          <CardContent>
            {typeSlices.length > 0 ? (
              // "classified", not "documents": a file that failed before the
              // classifier ran has no type, so this total can sit below the
              // one in the tile above without either being wrong.
              <DonutChart
                slices={typeSlices}
                total={documentTotal}
                totalLabel="classified"
                columns={['Type', 'Documents', 'Percentage']}
              />
            ) : (
              <p className="text-sm text-text-sub-600">
                No documents were classified in this window.
              </p>
            )}
          </CardContent>
        </Card>

        <MostUsedCard usage={data.usage} />
      </div>

      {/* These three carry short lists of different lengths, so they align at
          the top and end where their content ends. Stretching them to match
          would leave the shortest card mostly empty. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <TokenUsageCard tokens={data.tokens} />
        <TopSourcesCard rows={sourceRows} />
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

  // The same ring as "Documents by type", and the same colour per type, so a
  // reader can compare the two charts slice by slice.
  const slices: Slice[] = usage.byType.map((row) => ({
    key: row.type,
    label: typeLabel(row.type === 'unknown' ? null : row.type),
    value: row.uses,
    color: typeColor(row.type === 'unknown' ? null : row.type),
  }));

  const totalUses = usage.byType.reduce((sum, row) => sum + row.uses, 0);
  const active = selected ?? usage.byType[0]?.type ?? null;
  const documents = usage.documents.filter(
    (document) => (document.documentType ?? 'unknown') === active,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Most-used document types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {slices.length === 0 ? (
          <p className="text-sm text-text-sub-600">
            No document was opened, downloaded or cited in this window.
          </p>
        ) : (
          <>
            <DonutChart
              slices={slices}
              total={totalUses}
              totalLabel="uses"
              // "Uses", not "Documents": this ring counts how often each type
              // was opened, downloaded or cited, not how many of them exist.
              columns={['Type', 'Uses', 'Percentage']}
              onSelect={setSelected}
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

/**
 * One fixed colour per provider, so a source keeps its dot whatever its rank.
 *
 * The dot carries identity; the bar stays one hue because its length already
 * carries the magnitude. Colouring the bars per source would spend the only
 * free channel on information the bar has already given.
 */
const SOURCE_COLORS: Record<string, string> = {
  upload: '#3b82f6',
  google_drive: '#10b981',
};

/** Where the corpus came in from, ranked. */
function TopSourcesCard({ rows }: { rows: { key: string; label: string; value: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between pb-2">
        <CardTitle>Top data sources</CardTitle>
        <CardLink to="/sources">Manage</CardLink>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-text-sub-600">Nothing was ingested in this window.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.key} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="size-2.5 shrink-0 translate-y-px rounded-full"
                    style={{ backgroundColor: SOURCE_COLORS[row.key] ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-sub-600">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-text-strong-950">
                    {row.value}
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm tabular-nums text-text-soft-400">
                    {total === 0 ? '—' : `${((row.value / total) * 100).toFixed(1)}%`}
                  </span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-bg-soft-200">
                  <span
                    className="block h-full rounded-full bg-primary-base"
                    style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Only connected providers appear. A row of zeros for a connector
            nobody set up would read as a service that is failing. */}
        <p className="mt-4 border-t border-stroke-soft-200 pt-3 text-xs text-text-soft-400">
          Providers appear once they have contributed a document.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Input and output are two series in one bar, so they take the first two slots
 * of the validated categorical order rather than two steps of one hue: these
 * are different things being counted, not more and less of the same thing.
 */
const TOKEN_SERIES: ColumnSeries[] = [
  { label: 'Input', color: '#3b82f6' },
  { label: 'Output', color: '#f97316' },
];

/**
 * What each kind of model call is for, in words rather than enum values.
 *
 * The short form is for the column axis, where five labels share the width of
 * one card; the full one names the group in its tooltip.
 */
const PURPOSE_LABELS: Record<string, { full: string; short: string }> = {
  answer: { full: 'AI answers', short: 'Answers' },
  analysis: { full: 'Document analysis', short: 'Analysis' },
  entities: { full: 'Entity extraction', short: 'Entities' },
  vision: { full: 'Vision (scans, images)', short: 'Vision' },
  embedding: { full: 'Embeddings', short: 'Embed' },
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
  const naming = (purpose: string) =>
    PURPOSE_LABELS[purpose] ?? { full: purpose, short: purpose };

  // Only purposes the provider actually measured can be drawn: a pair of
  // zero-height columns would read as a job that cost nothing, when the truth
  // is that nobody counted.
  const measured = tokens.byPurpose.filter((row) => row.reportedCalls > 0);
  const unmeasured = tokens.byPurpose.filter((row) => row.reportedCalls === 0);

  const groups: ColumnGroup[] = measured.map((row) => ({
    key: row.purpose,
    label: naming(row.purpose).short,
    title: naming(row.purpose).full,
    values: [row.inputTokens, row.outputTokens],
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between pb-2">
        <CardTitle>Token usage</CardTitle>
        <span className="text-sm font-normal tabular-nums text-text-sub-600">
          {compact(tokens.totalInput + tokens.totalOutput)} total
        </span>
      </CardHeader>
      <CardContent>
        {tokens.byPurpose.length === 0 ? (
          <p className="text-sm text-text-sub-600">No model calls in this window.</p>
        ) : (
          <>
            {/* Two series, so a legend is not optional — the columns carry
                identity by colour alone without it. */}
            <div className="mb-2 flex items-center gap-4 text-xs text-text-sub-600">
              {TOKEN_SERIES.map((entry) => (
                <span key={entry.label} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </span>
              ))}
            </div>

            <GroupedColumns
              groups={groups}
              series={TOKEN_SERIES}
              format={compact}
              unit="tokens"
            />

            {unmeasured.length > 0 && (
              <p className="mt-3 text-xs text-text-soft-400">
                Not charted:{' '}
                {unmeasured
                  .map(
                    (row) =>
                      `${naming(row.purpose).full} (${row.calls} ${
                        row.calls === 1 ? 'call' : 'calls'
                      }, ${compact(row.inputChars)} chars)`,
                  )
                  .join(', ')}
                {' — the provider reports no token counts for these.'}
              </p>
            )}

            <p className="mt-3 border-t border-stroke-soft-200 pt-3 text-xs text-text-soft-400">
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
  // Each row keeps its own tint, matching the stat tiles above. The colour is
  // decoration attached to a labelled row, never the thing carrying meaning.
  const rows = [
    {
      icon: Activity,
      tone: TILE_TONES.blue,
      label: 'Total queries',
      value: String(ai.totalQueries),
    },
    { icon: Search, tone: TILE_TONES.green, label: 'Searches', value: String(ai.searches) },
    {
      icon: MessageSquare,
      tone: TILE_TONES.violet,
      label: 'AI questions',
      value: String(ai.questions),
    },
    {
      icon: Timer,
      tone: TILE_TONES.amber,
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
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', row.tone)}>
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
