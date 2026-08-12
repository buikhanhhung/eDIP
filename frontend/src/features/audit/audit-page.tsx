import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
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
  'document.upload': 'Upload',
  'document.view': 'View',
  'document.edit-metadata': 'Edit metadata',
  'document.delete': 'Delete',
  'document.download': 'Download',
  'search.query': 'Search',
  'ask.query': 'Ask AI',
};

export function AuditPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit'],
    queryFn: async () =>
      (await apiClient.get<{ items: AuditRow[]; total: number }>('/audit', { params: { take: 100 } }))
        .data,
  });

  if (isLoading) return <p className="text-sm text-text-sub-600">Loading the activity log…</p>;
  if (isError || !data) return <p className="text-sm text-danger-base">Could not load the activity log.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Activity log"
        description={`Every action recorded in the system — ${data.total} entries in total.`}
      />

      <div className="overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-text-sub-600">
                  No activity has been recorded yet.
                </TableCell>
              </TableRow>
            )}
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-text-sub-600">
                  {new Date(row.createdAt).toLocaleString('en-GB')}
                </TableCell>
                <TableCell>
                  {row.actor ? (
                    <span>
                      {row.actor.email} <Badge variant="outline">{row.actor.role}</Badge>
                    </span>
                  ) : (
                    <span className="text-text-sub-600">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ACTION_LABELS[row.action] ?? row.action}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">
                  {row.meta?.q ? (
                    <span className="text-text-sub-600">“{row.meta.q}”</span>
                  ) : row.targetId ? (
                    <Link to={`/documents/${row.targetId}`} className="hover:underline">
                      {row.targetId}
                    </Link>
                  ) : (
                    <span className="text-text-sub-600">—</span>
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
