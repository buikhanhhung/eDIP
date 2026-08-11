import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: { q?: string } | null;
  createdAt: string;
  actor: { id: string; email: string; role: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  'document.upload': 'Tải lên',
  'document.view': 'Xem',
  'document.edit-metadata': 'Sửa metadata',
  'document.delete': 'Xoá',
  'document.download': 'Tải xuống',
  'search.query': 'Tìm kiếm',
  'ask.query': 'Hỏi AI',
};

export function AuditPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit'],
    queryFn: async () =>
      (await apiClient.get<{ items: AuditRow[]; total: number }>('/audit', { params: { take: 100 } }))
        .data,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải nhật ký…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Không tải được nhật ký.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nhật ký hoạt động</h1>
        <p className="text-sm text-muted-foreground">{data.total} bản ghi</p>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời điểm</TableHead>
              <TableHead>Người thực hiện</TableHead>
              <TableHead>Hành động</TableHead>
              <TableHead>Đối tượng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Chưa có hoạt động nào được ghi lại.
                </TableCell>
              </TableRow>
            )}
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString('vi-VN')}
                </TableCell>
                <TableCell>
                  {row.actor ? (
                    <span>
                      {row.actor.email} <Badge variant="outline">{row.actor.role}</Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ACTION_LABELS[row.action] ?? row.action}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {row.meta?.q ? (
                    <span className="text-muted-foreground">“{row.meta.q}”</span>
                  ) : row.targetId ? (
                    <Link to={`/documents/${row.targetId}`} className="hover:underline">
                      {row.targetId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
