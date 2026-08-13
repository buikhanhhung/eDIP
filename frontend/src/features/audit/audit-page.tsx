import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, MessageSquare, ScrollText, Search, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { Pagination, PER_PAGE_CHOICES } from '@/components/pagination';
import { StatTile, TILE_TONES } from '@/components/stat-tile';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import type { StatDelta } from '@/features/documents/document-types';

interface AuditRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: { q?: string } | null;
  createdAt: string;
  actor: { id: string; email: string; role: string } | null;
}

interface AuditListResponse {
  items: AuditRow[];
  total: number;
  /** Document id → the name to show for it. Absent once a document is deleted. */
  targetNames: Record<string, string>;
}

interface AuditSummary {
  tiles: { total: StatDelta; added: StatDelta; searches: StatDelta; questions: StatDelta };
  /** Only people the log has an entry for. */
  actors: { id: string; email: string; role: string }[];
  /** Only actions the log actually holds. */
  actions: string[];
}

const ACTION_LABELS: Record<string, string> = {
  'document.upload': 'Upload',
  'document.import': 'Import from Drive',
  'document.view': 'View',
  'document.edit-metadata': 'Edit metadata',
  'document.delete': 'Delete',
  'document.download': 'Download',
  'document.export': 'Export CSV',
  'document.cite': 'Cited in an answer',
  'search.query': 'Search',
  'ask.query': 'Ask AI',
};

/**
 * The namespace in front of the dot — the coarse "what kind of thing happened"
 * that gives each row its one colour.
 *
 * One tinted chip per row and nothing else: the action beside it is a neutral
 * badge, so the eye has a single thing to follow down the column rather than
 * two competing ones.
 */
const CATEGORIES: Record<string, { label: string; tone: keyof typeof TILE_TONES }> = {
  document: { label: 'Document', tone: 'blue' },
  search: { label: 'Search', tone: 'green' },
  ask: { label: 'Ask AI', tone: 'violet' },
};

/** Losing a document is the one action worth spotting from across the table. */
const DESTRUCTIVE_ACTION = 'document.delete';

const DEFAULT_RANGE_DAYS = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function categoryOf(action: string): string {
  return action.split('.')[0];
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The window in the URL, so a filtered view can be pasted to somebody else. */
function rangeFromParams(params: URLSearchParams): DateRange {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return DAY.test(from) && DAY.test(to) && from <= to
    ? { from, to }
    : rangeFor(DEFAULT_RANGE_DAYS);
}

export function AuditPage() {
  // Filters live in the URL, as they do in the library: an auditor who finds
  // something worth showing somebody needs to be able to send them the view.
  const [searchParams, setSearchParams] = useSearchParams();

  const range = rangeFromParams(searchParams);
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const action = searchParams.get('action') ?? '';
  const actorId = searchParams.get('actorId') ?? '';
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);
  const perPage = PER_PAGE_CHOICES.includes(
    Number(searchParams.get('perPage')) as (typeof PER_PAGE_CHOICES)[number],
  )
    ? Number(searchParams.get('perPage'))
    : PER_PAGE_CHOICES[0];

  const hasFilters = Boolean(q || category || action || actorId);

  /**
   * Narrowing the result set sends the reader back to the first page. Staying
   * on page three of a list that now has one page shows an empty table and
   * looks like the filter matched nothing.
   */
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    // The chosen action may not belong to the new category, and a pair that
    // contradicts each other can only ever match nothing.
    if (key === 'category') next.delete('action');
    setSearchParams(next, { replace: true });
  }

  function setRange(value: DateRange) {
    const next = new URLSearchParams(searchParams);
    next.set('from', value.from);
    next.set('to', value.to);
    next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function setPageParam(key: 'page' | 'perPage', value: number) {
    const next = new URLSearchParams(searchParams);
    next.set(key, String(value));
    if (key === 'perPage') next.delete('page');
    setSearchParams(next, { replace: true });
  }

  // The window survives: it is the page's frame, not one of the filters
  // applied inside it.
  const clearFilters = () =>
    setSearchParams({ from: range.from, to: range.to }, { replace: true });

  const summary = useQuery({
    queryKey: ['audit-summary', range.from, range.to],
    queryFn: async () =>
      (await apiClient.get<AuditSummary>('/audit/summary', { params: range })).data,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit', { ...range, q, category, action, actorId, page, perPage }],
    queryFn: async () =>
      (
        await apiClient.get<AuditListResponse>('/audit', {
          params: {
            ...range,
            ...(q ? { q } : {}),
            ...(category ? { category } : {}),
            ...(action ? { action } : {}),
            ...(actorId ? { actorId } : {}),
            take: perPage,
            skip: (page - 1) * perPage,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const spanDays =
    Math.round(
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const comparison = `vs previous ${spanDays} days`;

  // Both dropdowns are built from what the log holds, so neither offers an
  // option that can only ever return an empty table.
  const actions = summary.data?.actions ?? [];
  const categories = [...new Set(actions.map(categoryOf))];
  const actionsInCategory = category ? actions.filter((a) => categoryOf(a) === category) : actions;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Activity log"
        description="Every action the platform recorded, newest first."
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {summary.isLoading && <p className="text-sm text-text-sub-600">Loading statistics…</p>}
      {summary.isError && (
        <p className="text-sm text-danger-base">Could not load the activity statistics.</p>
      )}

      {/* The tiles describe the whole window and ignore the filters below them:
          narrowing the table to searches must not report that nobody asked the
          AI anything. */}
      {summary.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            icon={Activity}
            tone="blue"
            label="Total activity"
            value={String(summary.data.tiles.total.value)}
            delta={summary.data.tiles.total}
            comparison={comparison}
          />
          <StatTile
            icon={Upload}
            tone="green"
            label="Documents added"
            value={String(summary.data.tiles.added.value)}
            delta={summary.data.tiles.added}
            comparison={comparison}
          />
          <StatTile
            icon={Search}
            tone="violet"
            label="Searches"
            value={String(summary.data.tiles.searches.value)}
            delta={summary.data.tiles.searches}
            comparison={comparison}
          />
          <StatTile
            icon={MessageSquare}
            tone="amber"
            label="AI questions"
            value={String(summary.data.tiles.questions.value)}
            delta={summary.data.tiles.questions}
            comparison={comparison}
          />
        </div>
      )}

      {/* Count and controls on one line, under the tiles: the filters act on
          the table below them, not on the figures above. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-sub-600">
          {data ? `${data.total} ${data.total === 1 ? 'entry' : 'entries'}` : 'Loading…'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* Wider than the other controls because its placeholder is the only
              place the three things it matches are named. Trimming the wording
              to fit a narrower box would hide that it searches query text. */}
          <Input
            className="w-72"
            placeholder="Filter by user, document or query"
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
          <Select
            className="w-36"
            value={category}
            onChange={(e) => setFilter('category', e.target.value)}
            aria-label="Activity type"
          >
            <option value="">All types</option>
            {categories.map((key) => (
              <option key={key} value={key}>
                {CATEGORIES[key]?.label ?? key}
              </option>
            ))}
          </Select>
          <Select
            className="w-44"
            value={action}
            onChange={(e) => setFilter('action', e.target.value)}
            aria-label="Action"
          >
            <option value="">All actions</option>
            {actionsInCategory.map((key) => (
              <option key={key} value={key}>
                {actionLabel(key)}
              </option>
            ))}
          </Select>
          <Select
            className="w-48"
            value={actorId}
            onChange={(e) => setFilter('actorId', e.target.value)}
            aria-label="User"
          >
            <option value="">All users</option>
            {(summary.data?.actors ?? []).map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.email}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
        {isError ? (
          <p className="p-6 text-sm text-danger-base">Could not load the activity log.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Action</TableHead>
                {/* Absorbs the leftover width and truncates, so a long
                    filename never pushes the columns before it off the edge. */}
                <TableHead className="w-full max-w-0">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((row) => (
                <LogRow key={row.id} row={row} targetNames={data.targetNames} />
              ))}
              {!isLoading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-text-sub-600">
                    {/* A quiet window and an over-filtered one look the same on
                        screen but need opposite actions. */}
                    {hasFilters
                      ? 'No activity matches the current filters.'
                      : 'No activity was recorded in this window.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {data && data.total > 0 && (
          <Pagination
            page={page}
            perPage={perPage}
            total={data.total}
            onPage={(next) => setPageParam('page', next)}
            onPerPage={(next) => setPageParam('perPage', next)}
            unit="entries"
          />
        )}
      </div>
    </div>
  );
}

function LogRow({ row, targetNames }: { row: AuditRow; targetNames: Record<string, string> }) {
  const category = CATEGORIES[categoryOf(row.action)];

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums text-text-sub-600">
        {formatMoment(row.createdAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.actor ? (
          <Actor email={row.actor.email} role={row.actor.role} />
        ) : (
          <span className="text-text-soft-400">—</span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            'inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
            category ? TILE_TONES[category.tone] : 'bg-bg-weak-50 text-text-sub-600',
          )}
        >
          {category?.label ?? categoryOf(row.action)}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={row.action === DESTRUCTIVE_ACTION ? 'destructive' : 'secondary'}>
          {actionLabel(row.action)}
        </Badge>
      </TableCell>
      <TableCell className="max-w-0">
        <Target row={row} targetNames={targetNames} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Initials in a disc beside the address.
 *
 * The email is the identity; the disc is there because one person doing fifty
 * things in a row is a wall of identical text otherwise, and the role belongs
 * under the name rather than in a third chip on an already busy line.
 */
function Actor({ email, role }: { email: string; role: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-lighter text-[11px] font-medium uppercase text-primary-dark">
        {email.slice(0, 2)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-text-strong-950">{email}</span>
        <span className="block text-xs capitalize text-text-soft-400">{role}</span>
      </span>
    </span>
  );
}

/**
 * What the action was done to: a document by name, or the text of a query.
 *
 * A row whose document has since been deleted says so rather than linking to a
 * page that would 404 — and for the row that recorded the deletion, that is the
 * correct outcome rather than a gap.
 */
function Target({ row, targetNames }: { row: AuditRow; targetNames: Record<string, string> }) {
  // The cell has no width of its own to give, so each of these truncates
  // rather than letting a long query push the columns before it off the edge.
  if (row.meta?.q)
    return (
      <span className="block truncate text-text-sub-600" title={row.meta.q}>
        “{row.meta.q}”
      </span>
    );

  if (row.targetId) {
    const name = targetNames[row.targetId];
    return name ? (
      <Link
        to={`/documents/${row.targetId}`}
        title={name}
        className="block truncate text-primary-base hover:underline"
      >
        {name}
      </Link>
    ) : (
      <span className="block truncate text-text-soft-400" title={row.targetId}>
        Document no longer exists
      </span>
    );
  }

  return <span className="text-text-soft-400">—</span>;
}

/** Date and time: an audit row without the clock on it is half a record. */
function formatMoment(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
