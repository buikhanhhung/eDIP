import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Rows navigate when given somewhere to go. */
  to?: string;
}

interface Props {
  rows: BarRow[];
  /** One colour for every bar: length already carries the magnitude. */
  color?: string;
  empty?: string;
  /** Adds each row's share of the total after its value. */
  showPercent?: boolean;
  /**
   * `stacked` puts the label and value on one line with the bar beneath.
   *
   * Needed in a narrow card: inline, the label and two number columns leave the
   * bar a few pixels wide, which encodes nothing.
   */
  layout?: 'inline' | 'stacked';
  /** Makes rows selectable in place, for a list that drills into a panel. */
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}

/**
 * Ranked magnitudes as a bar per row, with the value read off the end.
 *
 * A bar rather than a second donut: these categories are being compared
 * against each other, and length is the comparison people read accurately —
 * a ring is only good for "roughly what share of the whole".
 *
 * One hue for all bars, never a ramp: shading each bar darker-where-bigger
 * would encode length twice and spend the only free channel on information the
 * bar already gives.
 */
export function BarList({
  rows,
  color = 'bg-primary-base',
  empty,
  showPercent,
  layout = 'inline',
  onSelect,
  selectedKey,
}: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-sub-600">{empty ?? 'Nothing to show yet.'}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);
  const sum = rows.reduce((running, row) => running + row.value, 0);
  const stacked = layout === 'stacked';

  return (
    <ul className={stacked ? 'space-y-2.5' : 'space-y-3'}>
      {rows.map((row) => {
        const bar = (
          <span className="block h-2 overflow-hidden rounded-full bg-bg-soft-200">
            <span
              className={cn('block h-full rounded-full transition-default', color)}
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </span>
        );

        const percent = showPercent && (
          <span className="w-12 shrink-0 text-right text-sm tabular-nums text-text-soft-400">
            {sum === 0 ? '—' : `${((row.value / sum) * 100).toFixed(1)}%`}
          </span>
        );

        const body = stacked ? (
          <span className="block w-full space-y-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-text-sub-600">{row.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-text-strong-950">{row.value}</span>
              {percent}
            </span>
            {bar}
          </span>
        ) : (
          <>
            <span className="w-28 shrink-0 truncate text-sm text-text-sub-600">{row.label}</span>
            <span className="flex-1">{bar}</span>
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-strong-950">
              {row.value}
            </span>
            {percent}
          </>
        );

        const interactive = cn(
          'w-full rounded-md px-2 py-1 text-left transition-default hover:bg-bg-weak-50',
          stacked ? 'block' : 'flex items-center gap-3',
        );

        return (
          <li key={row.key}>
            {row.to ? (
              <Link to={row.to} className={interactive}>
                {body}
              </Link>
            ) : onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row.key)}
                aria-pressed={selectedKey === row.key}
                className={cn(interactive, selectedKey === row.key && 'bg-bg-weak-50')}
              >
                {body}
              </button>
            ) : (
              <div className={cn('px-2 py-1', stacked ? 'block' : 'flex items-center gap-3')}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
