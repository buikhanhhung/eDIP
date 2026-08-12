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
import { useAuth } from '@/features/auth/auth-context';
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

/**
 * The file column absorbs the leftover width and truncates; every other column
 * states its own natural width and stays on one line, so a long Vietnamese
 * filename never pushes the dates off the edge.
 */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    className?: string;
  }
}

const columns = [
  columnHelper.accessor('filename', {
    header: 'File',
    meta: { className: 'w-full max-w-0' },
    cell: (info) => (
      <div className="min-w-0">
        <Link
          to={`/documents/${info.row.original.id}`}
          className="block truncate font-medium text-text-strong-950 hover:text-primary-base hover:underline"
        >
          {info.getValue()}
        </Link>
        {info.row.original.title && (
          <p className="truncate text-xs text-text-soft-400">{info.row.original.title}</p>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('documentType', {
    header: 'Type',
    meta: { className: 'whitespace-nowrap' },
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="secondary">{typeLabel(info.getValue())}</Badge>
      ) : (
        <span className="text-text-soft-400">—</span>
      ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    meta: { className: 'max-w-[16rem]' },
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(info.getValue())}>{statusLabel(info.getValue())}</Badge>
        {info.row.original.error && (
          <span className="truncate text-xs text-danger-base" title={info.row.original.error}>
            {info.row.original.error}
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('uploadedAt', {
    header: 'Uploaded',
    meta: { className: 'whitespace-nowrap' },
    cell: (info) => (
      <span className="tabular-nums text-text-sub-600">{formatDate(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor((row) => row.owner?.email ?? '—', {
    id: 'owner',
    header: 'Uploaded by',
    meta: { className: 'whitespace-nowrap' },
    cell: (info) => <span className="text-text-sub-600">{info.getValue()}</span>,
  }),
];

export function LibraryPage() {
  // Filters live in the URL so a filtered view can be linked to — the dashboard
  // tiles navigate straight into one.
  const { can } = useAuth();
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
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-text-sub-600">
            {data ? `${data.total} documents` : 'Loading…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            placeholder="Filter by file name or title"
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
          <Select className="w-40" value={type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">All types</option>
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
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          {(q || type || status) && (
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
        {isError ? (
          <p className="p-6 text-sm text-danger-base">Could not load the document list.</p>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
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
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!isLoading && table.getRowModel().rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-10 text-center">
                    {/* An empty library and an over-filtered one look the same
                        on screen but need opposite actions, so they say
                        different things. */}
                    {q || type || status ? (
                      <span className="text-text-sub-600">
                        No documents match the current filters.
                      </span>
                    ) : (
                      <span className="text-text-sub-600">
                        No documents yet.{' '}
                        {can('upload') && (
                          <Link to="/upload" className="text-primary-base hover:underline">
                            Upload one to get started
                          </Link>
                        )}
                      </span>
                    )}
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
