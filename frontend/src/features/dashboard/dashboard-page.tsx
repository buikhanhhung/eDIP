import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, statusVariant } from '@/components/ui/badge';
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-text-sub-600">Everything ingested into the platform so far.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total documents" value={data.total} />
        <StatCard label="Processed" value={completed} />
        <StatCard label="Failed" value={failed} tone={failed > 0 ? 'destructive' : undefined} />
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
                <Badge variant={statusVariant(status)}>
                  {statusLabel(status)} · {count}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'destructive';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            tone === 'destructive'
              ? 'text-3xl font-semibold tabular-nums text-danger-base'
              : 'text-3xl font-semibold tabular-nums'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
