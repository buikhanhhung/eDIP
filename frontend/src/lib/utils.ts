import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A file size in the unit a reader thinks in, never more precision than the
 * figure deserves: 1.4 MB rather than 1,468,006 B, and 340 MB rather than
 * 340.2 MB, where the tenth of a megabyte tells nobody anything.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // A named month rather than a numeric one: 03/04 reads as two different days
  // depending on where the reader learned to write dates.
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
