import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Tints for the badge beside a section title. */
export const SECTION_TONES = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-emerald-50 text-emerald-600',
} as const;

export type SectionTone = keyof typeof SECTION_TONES;

export function SectionIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: SectionTone }) {
  return (
    <span
      className={cn('grid size-10 shrink-0 place-items-center rounded-xl', SECTION_TONES[tone])}
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * A card's own heading: tinted badge, name, and whatever acts on that section.
 *
 * Shared rather than written out per card because the action belongs beside the
 * state that drives it — the metadata panel owns its edit button, so it draws
 * its own heading rather than having the page draw one above it.
 */
export function SectionTitle({
  icon,
  tone,
  title,
  action,
}: {
  icon: LucideIcon;
  tone: SectionTone;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <SectionIcon icon={icon} tone={tone} />
        <h2 className="text-base font-semibold text-text-strong-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}
