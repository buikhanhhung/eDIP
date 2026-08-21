import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CHUNKING_LABELS, CHUNKING_NOTES } from '@/features/documents/document-types';
import { cn } from '@/lib/utils';

const OPTIONS = Object.keys(CHUNKING_LABELS);

interface Props {
  open: boolean;
  /** The strategy currently selected, so reopening remembers the last choice. */
  value: string;
  onChange: (strategy: string) => void;
  onConfirm: (strategy: string) => void;
  onCancel: () => void;
  /** What the confirm button will lead to, e.g. "Choose files". */
  confirmLabel: string;
}

/**
 * Asked before the files are, because the answer changes how they are read.
 *
 * A dialog rather than a control on the page: the choice is per upload, not a
 * setting, and putting it in the flow means it is answered deliberately instead
 * of inherited from whatever was left selected. Both the local picker and the
 * Drive picker open only after it is answered.
 */
export function ChunkingStrategyDialog({
  open,
  value,
  onChange,
  onConfirm,
  onCancel,
  confirmLabel,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog so the keyboard lands
  // somewhere useful rather than back on the page behind it.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input[type="radio"]:checked')?.focus();

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      // A click that starts and ends on the backdrop dismisses; one that began
      // inside the panel does not, so dragging out of it cannot close the box.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chunking-dialog-title"
        className="w-full max-w-lg rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stroke-soft-200 p-5">
          <div>
            <h2 id="chunking-dialog-title" className="text-lg font-semibold text-text-strong-950">
              How should these documents be read?
            </h2>
            <p className="mt-1 text-sm text-text-sub-600">
              This decides how each file is split before it is indexed. It applies to everything in
              this batch.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-md p-1 text-text-soft-400 transition-default hover:bg-bg-weak-50 hover:text-text-strong-950"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {OPTIONS.map((id) => (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer gap-3 rounded-md border p-3 transition-default',
                id === value
                  ? 'border-primary-base bg-primary-lighter'
                  : 'border-stroke-soft-200 hover:bg-bg-weak-50',
              )}
            >
              <input
                type="radio"
                name="chunking-strategy"
                value={id}
                checked={id === value}
                onChange={() => onChange(id)}
                className="mt-0.5 size-4 shrink-0 accent-primary-base"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-strong-950">
                  {CHUNKING_LABELS[id]}
                </span>
                <span className="mt-0.5 block text-xs text-text-sub-600">
                  {CHUNKING_NOTES[id] ?? ''}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-stroke-soft-200 p-5">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(value)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
