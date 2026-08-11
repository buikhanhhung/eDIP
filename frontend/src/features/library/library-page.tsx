import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  statusLabel,
  typeLabel,
  TYPE_LABELS,
  STATUS_LABELS,
  type DocumentListItem,
  type DocumentListResponse,
} from '@/features/documents/document-types';

const columnHelper = createColumnHelper<DocumentListItem>();

const columns = [
  columnHelper.accessor('filename', {
    header: 'Tệp',
    cell: (info) => (
      <div className="min-w-0">
        <Link
          to={`/documents/${info.row.original.id}`}
          className="truncate font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
        {info.row.original.title && (
          <p className="truncate text-xs text-muted-foreground">{info.row.original.title}</p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('documentType', {
    header: 'Loại',
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="secondary">{typeLabel(info.getValue())}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }),
  columnHelper.accessor('status', {
    header: 'Trạng thái',
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(info.getValue())}>{statusLabel(info.getValue())}</Badge>
        {info.row.original.error && (
          <span className="truncate text-xs text-destructive" title={info.row.original.error}>
            {info.row.original.error}
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('uploadedAt', {
    header: 'Tải lên',
    cell: (info) => <span className="tabular-nums">{formatDate(info.getValue())}</span>,
  }),
  columnHelper.accessor((row) => row.owner?.email ?? '—', {
    id: 'owner',
    header: 'Người tải',
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
];

export function LibraryPage() {
  // Filters live in the URL so a filtered view can be linked to — the dashboard
  // tiles navigate straight into one.
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? '';
  const status = searchParams.get('status') ?? '';

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', { q, type, status }],
    queryFn: async () =>
      (
        await apiClient.get<DocumentListResponse>('/documents', {
          params: {
            ...(q ? { q } : {}),
            ...(type ? { type } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Thư viện</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} tài liệu` : 'Đang tải…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            placeholder="Lọc theo tên tệp hoặc tiêu đề"
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
          <Select className="w-40" value={type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">Mọi loại</option>
            {Object.entries(TYPE_LABELS)
              .filter(([key]) => key !== 'unknown')
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </Select>
          <Select
            className="w-40"
            value={status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          {(q || type || status) && (
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        {isError ? (
          <p className="p-6 text-sm text-destructive">Không tải được danh sách tài liệu.</p>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                    Không có tài liệu nào khớp bộ lọc.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
