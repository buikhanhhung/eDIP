/**
 * The window an overview is measured over, and the arithmetic around it.
 *
 * Pure, and separate from the service that queries with it: these are the rules
 * a reader is trusting when they read "↑ 12.5% vs previous 30 days", and they
 * are worth stating in one place where they can be checked.
 */

/** What the overview shows when the caller names no window. */
export const DEFAULT_RANGE_DAYS = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

export interface OverviewRange {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to: string;
}

export interface Window {
  start: Date;
  /** Exclusive, so a day-inclusive range needs no 23:59:59.999. */
  end: Date;
}

/** A figure beside the same figure one window earlier. */
export interface Delta {
  value: number;
  previous: number;
  /**
   * Null when the earlier window holds nothing. A jump from zero has no
   * percentage — reporting one would turn "the first documents ever" into a
   * growth rate.
   */
  changePct: number | null;
}

/**
 * A caller may name both ends, one end, or neither.
 *
 * Anything unparseable is ignored rather than rejected: a malformed date in a
 * bookmarked URL should show the default window, not an error page where a
 * dashboard used to be. A `from` after `to` is treated the same way, since an
 * inverted range describes no days at all.
 */
export function resolveRange(from?: string, to?: string, today = new Date()): OverviewRange {
  const end = DAY.test(to ?? '') ? (to as string) : isoDay(today);
  if (DAY.test(from ?? '') && (from as string) <= end) return { from: from as string, to: end };

  const start = new Date(`${end}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return { from: isoDay(start), to: end };
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toWindow(range: OverviewRange): Window {
  return {
    start: new Date(`${range.from}T00:00:00.000Z`),
    end: new Date(new Date(`${range.to}T00:00:00.000Z`).getTime() + MS_PER_DAY),
  };
}

/** The window of equal length ending where this one starts. */
export function precedingWindow(window: Window): Window {
  const span = window.end.getTime() - window.start.getTime();
  return { start: new Date(window.start.getTime() - span), end: window.start };
}

export function delta(value: number, previous: number): Delta {
  return {
    value,
    previous,
    changePct: previous === 0 ? null : ((value - previous) / previous) * 100,
  };
}
