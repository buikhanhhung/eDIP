import { Calendar, Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to: string;
}

interface Preset {
  key: string;
  label: string;
  /** Days in the window, today included. */
  days: number;
}

/**
 * Windows that mean something to a reader, rather than every window that can be
 * expressed. Anyone who wants an exact span can type it into the two fields at
 * the bottom.
 */
const PRESETS: Preset[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '12m', label: 'Last 12 months', days: 365 },
];

export function rangeFor(days: number): DateRange {
  const today = new Date();
  const to = isoDay(today);
  today.setUTCDate(today.getUTCDate() - (days - 1));
  return { from: isoDay(today), to };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatRange(range: DateRange): string {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();

  const short = (date: Date, withYear: boolean) =>
    date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });

  return `${short(from, !sameYear)} – ${short(to, true)}`;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * The window every figure on the page obeys.
 *
 * A list of presets with the custom span behind a hairline at the foot, which
 * is the shape a date filter takes: the named window is what people pick nine
 * times out of ten, and putting two empty date fields first makes them do
 * arithmetic to ask for "last month".
 */
export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // A dropdown that survives a click on the page behind it is a dropdown the
  // reader has to dismiss twice.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [open]);

  const activePreset = PRESETS.find(
    (preset) => JSON.stringify(rangeFor(preset.days)) === JSON.stringify(value),
  );

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-3 py-2 text-sm text-text-strong-950 shadow-soft transition-default hover:bg-bg-weak-50"
      >
        <Calendar className="size-4 text-text-soft-400" />
        {formatRange(value)}
        <ChevronDown className={cn('size-4 text-text-soft-400', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-1.5 shadow-raised">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                onChange(rangeFor(preset.days));
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-text-strong-950 transition-default hover:bg-bg-weak-50"
            >
              {preset.label}
              {activePreset?.key === preset.key && (
                <Check className="size-4 text-primary-base" strokeWidth={2.5} />
              )}
            </button>
          ))}

          <div className="mt-1.5 border-t border-stroke-soft-200 px-2.5 pb-1 pt-2.5">
            <p className="mb-1.5 text-subheading-xs uppercase text-text-soft-400">Custom range</p>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={value.from}
                max={value.to}
                onChange={(event) =>
                  event.target.value && onChange({ ...value, from: event.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-stroke-soft-200 px-1.5 py-1 text-xs text-text-strong-950"
              />
              <span className="text-xs text-text-soft-400">–</span>
              <input
                type="date"
                value={value.to}
                min={value.from}
                max={isoDay(new Date())}
                onChange={(event) =>
                  event.target.value && onChange({ ...value, to: event.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-stroke-soft-200 px-1.5 py-1 text-xs text-text-strong-950"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
