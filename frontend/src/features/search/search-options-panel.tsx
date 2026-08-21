import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchOptions {
  resultLimit: number;
  laneLimit: number;
  snippetRadius: number;
  lanes: 'both' | 'vector' | 'lexical';
}

/** Mirrors the server's own defaults; sending none of these means exactly this. */
export const SEARCH_DEFAULTS: SearchOptions = {
  resultLimit: 10,
  laneLimit: 10,
  snippetRadius: 120,
  lanes: 'both',
};

/** Same bounds the server clamps to, so the slider cannot ask for a refusal. */
const LIMITS = {
  resultLimit: { min: 1, max: 50 },
  laneLimit: { min: 1, max: 50 },
  snippetRadius: { min: 40, max: 400 },
};

const LANE_LABELS: Record<SearchOptions['lanes'], string> = {
  both: 'Both — meaning and keywords, fused',
  vector: 'Meaning only — embeddings',
  lexical: 'Keywords only — full-text',
};

interface Props {
  value: SearchOptions;
  onChange: (options: SearchOptions) => void;
  /** Re-runs the current query so a changed knob is visible immediately. */
  onApply: () => void;
  disabled?: boolean;
}

/**
 * Per-query search knobs, collapsed until asked for.
 *
 * Collapsed because the defaults are the right answer for almost every query,
 * and a page that opens with six controls reads as one that needs tuning before
 * it works.
 *
 * Two knobs are deliberately not here. The fusion constant has a measured
 * reason behind its current value and this project has no retrieval-quality
 * measure to tell whether moving it helped, so a control for it would only let
 * someone make ranking quietly worse. The /ask context size governs prompt
 * length, which the hierarchical chunking strategies already inflate.
 */
export function SearchOptionsPanel({ value, onChange, onApply, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(SEARCH_DEFAULTS);

  const number = (key: 'resultLimit' | 'laneLimit' | 'snippetRadius', label: string, hint: string) => (
    <label className="block">
      <span className="block text-xs font-medium text-text-strong-950">{label}</span>
      <span className="mt-0.5 block text-[11px] text-text-soft-400">{hint}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type="range"
          min={LIMITS[key].min}
          max={LIMITS[key].max}
          value={value[key]}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          className="h-1.5 w-full accent-primary-base"
        />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-text-sub-600">
          {value[key]}
        </span>
      </span>
    </label>
  );

  return (
    <div className="rounded-lg border border-stroke-soft-200 bg-bg-white-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-text-sub-600 transition-default hover:text-text-strong-950"
      >
        <SlidersHorizontal className="size-4" />
        Search options
        {changed && !open && (
          <span className="rounded-full bg-primary-lighter px-2 py-0.5 text-[11px] font-medium text-primary-base">
            changed
          </span>
        )}
        <ChevronDown
          className={cn('ml-auto size-4 transition-default', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-stroke-soft-200 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {number('resultLimit', 'Results', 'How many documents come back.')}
            {number('laneLimit', 'Lane width', 'Candidates each lane contributes before fusion.')}
            {number('snippetRadius', 'Snippet width', 'Characters either side of the match.')}
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-text-strong-950">Lanes</span>
            <span className="mt-0.5 block text-[11px] text-text-soft-400">
              Turning one off is the quickest way to see what the other contributes.
            </span>
            <Select
              className="mt-1.5"
              value={value.lanes}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...value, lanes: event.target.value as SearchOptions['lanes'] })
              }
            >
              {Object.entries(LANE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke-soft-200 pt-3">
            <p className="text-[11px] text-text-soft-400">
              These apply to this query only — nothing is saved.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || !changed}
                onClick={() => onChange(SEARCH_DEFAULTS)}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reset
              </Button>
              <Button size="sm" disabled={disabled} onClick={onApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
