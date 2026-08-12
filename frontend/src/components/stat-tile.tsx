import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StatDelta } from '@/features/documents/document-types';

/**
 * One tinted chip per figure.
 *
 * These five are roles rather than a data series — each is bolted to one
 * meaning for the life of the page, and each sits beside its own label — so
 * they are named colours rather than palette slots. Raw hues rather than the
 * AlignUI tokens because the token set carries four intents and this needs
 * five; inventing a fifth token for one card would be worse.
 */
export const TILE_TONES = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
} as const;

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof TILE_TONES;
  delta?: StatDelta;
  /**
   * True when a rise is bad news — the failure count going up is not growth.
   * Colour follows the meaning, never the sign.
   */
  inverse?: boolean;
  /** Names the window the comparison is against, e.g. "vs previous 30 days". */
  comparison: string;
}

export function StatTile({ icon: Icon, label, value, tone, delta, inverse, comparison }: Props) {
  return (
    <Card className="h-full">
      {/* Icon beside the label, as in the reference. Five tiles across leave
          roughly 140px inside each card, so the icon is 36px and the label 12px
          — enough for "Total documents" to stay on one line beside it. */}
      <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl',
              TILE_TONES[tone],
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-text-sub-600">{label}</p>
            {/* Proportional figures: a hero number is read, not aligned. */}
            <p className="truncate text-[22px] font-semibold leading-tight text-text-strong-950">
              {value}
            </p>
          </div>
        </div>
        {delta && <DeltaLine delta={delta} inverse={inverse} comparison={comparison} />}
      </CardContent>
    </Card>
  );
}

/**
 * The change, with an arrow so the direction is not carried by colour alone.
 *
 * When the earlier window held nothing there is no percentage to state, and
 * "+100%" would be a claim about growth from a baseline that never existed.
 * The honest reading is that this is all there has been.
 */
function DeltaLine({
  delta,
  inverse,
  comparison,
}: {
  delta: StatDelta;
  inverse?: boolean;
  comparison: string;
}) {
  if (delta.changePct === null) {
    return (
      <p className="truncate text-[11px] text-text-soft-400" title={`No data ${comparison}`}>
        {delta.value === 0 ? 'Nothing in this window' : 'No earlier data'}
      </p>
    );
  }

  const rose = delta.changePct > 0;
  const flat = Math.abs(delta.changePct) < 0.05;
  const good = inverse ? !rose : rose;
  const Arrow = rose ? ArrowUp : ArrowDown;

  return (
    <p className="flex items-center gap-1 text-[11px]" title={`${delta.previous} ${comparison}`}>
      {flat ? (
        <span className="font-medium text-text-sub-600">No change</span>
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center gap-0.5 font-medium',
            good ? 'text-emerald-600' : 'text-red-600',
          )}
        >
          <Arrow className="size-3" strokeWidth={2.5} />
          {Math.abs(delta.changePct).toFixed(1)}%
        </span>
      )}
      <span className="truncate text-text-soft-400">{comparison}</span>
    </p>
  );
}
