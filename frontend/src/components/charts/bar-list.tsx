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
export function BarList({ rows, color = 'bg-primary-base', empty }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-sub-600">{empty ?? 'Nothing to show yet.'}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const body = (
          <>
            <span className="w-32 shrink-0 truncate text-sm text-text-sub-600">{row.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-soft-200">
              <span
                className={cn('block h-full rounded-full transition-default', color)}
                style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-text-strong-950">
              {row.value}
            </span>
          </>
        );

        return (
          <li key={row.key}>
            {row.to ? (
              <Link
                to={row.to}
                className="flex items-center gap-3 rounded-md px-2 py-1 transition-default hover:bg-bg-weak-50"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
