import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarList } from '@/components/charts/bar-list';
import { DonutChart, type Slice } from '@/components/charts/donut-chart';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { typeLabel, type DocumentStats } from '@/features/documents/document-types';

/**
 * The categorical order is fixed and validated, not picked per render: colour
 * follows the document type, so a type disappearing never repaints the ones
 * that remain.
 */
const TYPE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

/** How the text was obtained, in words rather than column values. */
const SOURCE_LABELS: Record<string, string> = {
  native: 'Read directly',
  pdf_text: 'PDF text layer',
  docx: 'Word document',
  xlsx: 'Spreadsheet',
  pptx: 'Presentation',
  vision: 'Vision (scan or image)',
};

const ACTION_LABELS: Record<string, string> = {
  'document.upload': 'Uploads',
  'document.import': 'Imports',
  'document.view': 'Views',
  'document.download': 'Downloads',
  'document.export': 'Exports',
  'document.edit-metadata': 'Metadata edits',
  'document.delete': 'Deletes',
  'search.query': 'Searches',
  'ask.query': 'AI questions',
};

/** Below this a "trend" is one spike on an empty axis, which says nothing. */
const MIN_DAYS_FOR_TREND = 3;

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await apiClient.get<DocumentStats>('/stats')).data,
  });

  if (isLoading) return <p className="text-sm text-text-sub-600">Loading statistics…</p>;
  if (isError || !data) {
    return <p className="text-sm text-danger-base">Could not load the overview statistics.</p>;
  }

  const completed = data.byStatus.completed ?? 0;
  const failed = data.byStatus.failed ?? 0;

  const typeSlices: Slice[] = Object.entries(data.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TYPE_COLORS.length)
    .map(([type, count], index) => ({
      key: type,
      label: typeLabel(type),
      value: count,
      color: TYPE_COLORS[index],
    }));

  const sourceRows = Object.entries(data.bySource ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({
      key: source,
      label: SOURCE_LABELS[source] ?? source,
      value: count,
    }));

  const activityRows = Object.entries(data.activity?.byAction ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => ({
      key: action,
      label: ACTION_LABELS[action] ?? action,
      value: count,
    }));

  const days = data.daily ?? [];
  const showTrend = days.length >= MIN_DAYS_FOR_TREND;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        description="Everything ingested into the platform so far."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Total documents" value={data.total} tone="primary" />
        <StatCard icon={CheckCircle2} label="Processed" value={completed} tone="success" />
        <StatCard icon={AlertCircle} label="Failed" value={failed} tone="danger" />
        <StatCard
          icon={Database}
          label="Storage used"
          value={formatBytes(data.totalBytes ?? 0)}
          tone="neutral"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>By document type</CardTitle>
          </CardHeader>
          <CardContent>
            {typeSlices.length > 0 ? (
              <DonutChart slices={typeSlices} total={data.total} totalLabel="documents" />
            ) : (
              <p className="text-sm text-text-sub-600">No documents have been classified yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>How the text was read</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={sourceRows} empty="Nothing has been processed yet." />
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ingest over time</CardTitle>
          </CardHeader>
          <CardContent>
            {showTrend ? (
              <IngestTrend days={days} />
            ) : (
              // A single day is a point, not a trend. Saying so beats drawing
              // one spike against thirty empty days.
              <p className="text-sm text-text-sub-600">
                {days.length === 0
                  ? 'No documents in the last 30 days.'
                  : `All ${days.reduce((sum, day) => sum + day.uploaded, 0)} documents were ingested on ${formatDay(days[0].date)}. A trend appears once there are at least ${MIN_DAYS_FOR_TREND} days of activity.`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-baseline justify-between pb-2">
            <CardTitle>Activity</CardTitle>
            <Link to="/audit" className="text-sm font-normal text-primary-base hover:underline">
              Activity log
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarList rows={activityRows} empty="Nothing has happened yet." />
            {data.activity && (
              <p className="border-t border-stroke-soft-200 pt-3 text-sm text-text-sub-600">
                {data.activity.activeUsers} account
                {data.activity.activeUsers === 1 ? '' : 's'} active
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Bars over days: one series, so no legend — the card title names it. */
function IngestTrend({ days }: { days: { date: string; uploaded: number; failed: number }[] }) {
  const max = Math.max(...days.map((day) => day.uploaded), 1);

  return (
    <div className="flex h-40 items-end gap-1.5">
      {days.map((day) => (
        <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span
            className="w-full rounded-t bg-primary-base transition-default group-hover:bg-primary-dark"
            style={{ height: `${Math.max((day.uploaded / max) * 120, 3)}px` }}
            title={`${formatDay(day.date)}: ${day.uploaded} uploaded, ${day.failed} failed`}
          />
          <span className="w-full truncate text-center text-[10px] tabular-nums text-text-soft-400">
            {day.date.slice(8)}
          </span>
        </div>
      ))}
    </div>
  );
}

const TONES = {
  primary: 'bg-primary-lighter text-primary-base',
  success: 'bg-success-light text-success-base',
  danger: 'bg-danger-light text-danger-base',
  neutral: 'bg-bg-weak-50 text-text-sub-600',
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-text-sub-600">{label}</p>
          {/* Proportional figures: tabular ones make a short number look loose
              at this size, and nothing here has to align in a column. */}
          <p className="text-3xl font-semibold text-text-strong-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
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

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
