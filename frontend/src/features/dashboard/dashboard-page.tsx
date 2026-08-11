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

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải số liệu…</p>;
  if (isError || !data) {
    return <p className="text-sm text-destructive">Không tải được số liệu tổng quan.</p>;
  }

  const completed = data.byStatus.completed ?? 0;
  const failed = data.byStatus.failed ?? 0;
  const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">Toàn bộ tài liệu đã nạp vào hệ thống.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tổng tài liệu" value={data.total} />
        <StatCard label="Xử lý xong" value={completed} />
        <StatCard label="Lỗi xử lý" value={failed} tone={failed > 0 ? 'destructive' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Theo loại tài liệu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {types.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có tài liệu nào được phân loại.</p>
            )}
            {types.map(([type, count]) => (
              <Link
                key={type}
                to={`/library?type=${encodeURIComponent(type)}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="w-32 shrink-0 text-sm">{typeLabel(type)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
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
            <CardTitle>Theo trạng thái</CardTitle>
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
              ? 'text-3xl font-semibold tabular-nums text-destructive'
              : 'text-3xl font-semibold tabular-nums'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
