import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  /** 1-based. */
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  onPerPage: (perPage: number) => void;
  /** Names what is being counted, e.g. "documents". */
  unit: string;
}

export const PER_PAGE_CHOICES = [10, 25, 50] as const;

/** Beyond this many pages the list gains gaps rather than growing sideways. */
const MAX_NUMBERED = 7;

/**
 * Page controls with the range in words beside them.
 *
 * "Showing 1 to 10 of 21" is the part that answers the question people actually
 * have — whether they are seeing everything. The numbered buttons only answer
 * where to go next.
 */
export function Pagination({ page, perPage, total, onPage, onPerPage, unit }: Props) {
  const pages = Math.max(Math.ceil(total / perPage), 1);
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke-soft-200 px-5 py-3">
      <p className="text-sm text-text-sub-600">
        {total === 0
          ? `No ${unit}`
          : `Showing ${first} to ${last} of ${total} ${unit}`}
      </p>

      <div className="flex items-center gap-1">
        <PageButton
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </PageButton>

        {numbersAround(page, pages).map((entry, index) =>
          entry === null ? (
            // A gap, not a button: there is nothing meaningful to click when
            // the jump is arbitrary.
            <span key={`gap-${index}`} className="px-1 text-sm text-text-soft-400">
              …
            </span>
          ) : (
            <PageButton
              key={entry}
              onClick={() => onPage(entry)}
              current={entry === page}
              label={`Page ${entry}`}
            >
              {entry}
            </PageButton>
          ),
        )}

        <PageButton
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          label="Next page"
        >
          <ChevronRight className="size-4" />
        </PageButton>
      </div>

      <Select
        className="w-36"
        value={perPage}
        onChange={(event) => onPerPage(Number(event.target.value))}
        aria-label={`${unit} per page`}
      >
        {PER_PAGE_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {choice} per page
          </option>
        ))}
      </Select>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'grid size-8 place-items-center rounded-lg border text-sm tabular-nums transition-default',
        current
          ? 'border-primary-base bg-primary-base text-text-white-0'
          : 'border-stroke-soft-200 text-text-sub-600 hover:bg-bg-weak-50',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The pages worth showing: always the first and last, always the current and
 * its neighbours, with a gap standing in for whatever is skipped.
 *
 * Below the cap every page is listed — a gap in a short list hides nothing and
 * costs a click.
 */
function numbersAround(page: number, pages: number): (number | null)[] {
  if (pages <= MAX_NUMBERED) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }

  const keep = new Set([1, pages, page, page - 1, page + 1]);
  const shown = [...keep].filter((entry) => entry >= 1 && entry <= pages).sort((a, b) => a - b);

  return shown.flatMap((entry, index) => {
    const previous = shown[index - 1];
    return previous !== undefined && entry - previous > 1 ? [null, entry] : [entry];
  });
}
