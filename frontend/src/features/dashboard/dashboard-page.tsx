import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileText, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { statusLabel, typeLabel, type DocumentStats } from '@/features/documents/document-types';

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
  const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        description="Everything ingested into the platform so far."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label="Total documents" value={data.total} tone="primary" />
        <StatCard icon={CheckCircle2} label="Processed" value={completed} tone="success" />
        <StatCard icon={AlertCircle} label="Failed" value={failed} tone="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By document type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {types.length === 0 && (
              <p className="text-sm text-text-sub-600">No documents have been classified yet.</p>
            )}
            {types.map(([type, count]) => (
              <Link
                key={type}
                to={`/library?type=${encodeURIComponent(type)}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-bg-weak-50"
              >
                <span className="w-32 shrink-0 text-sm">{typeLabel(type)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-soft-200">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(count / data.total) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right text-sm tabular-nums">{count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <Link key={status} to={`/library?status=${encodeURIComponent(status)}`}>
                <StatusPill status={status} label={`${statusLabel(status)} · ${count}`} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Tint carries the meaning; the number stays the same weight in all three. */
const TONES = {
  primary: 'bg-primary-lighter text-primary-base',
  success: 'bg-success-light text-success-base',
  danger: 'bg-danger-light text-danger-base',
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', TONES[tone])}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm text-text-sub-600">{label}</p>
          <p className="text-3xl font-semibold tabular-nums text-text-strong-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
