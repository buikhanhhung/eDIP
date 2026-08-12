import { cn } from '@/lib/utils';

/**
 * The extension a reader recognises, in the colour they expect to see it in —
 * the same red for PDF and green for a spreadsheet that every file manager
 * uses. It scans far faster down a column than the filename does.
 */
const PALETTE: Record<string, string> = {
  pdf: 'bg-red-500',
  doc: 'bg-blue-500',
  docx: 'bg-blue-500',
  xls: 'bg-emerald-600',
  xlsx: 'bg-emerald-600',
  csv: 'bg-emerald-600',
  ppt: 'bg-orange-500',
  pptx: 'bg-orange-500',
  png: 'bg-violet-500',
  jpg: 'bg-violet-500',
  jpeg: 'bg-violet-500',
  webp: 'bg-violet-500',
  md: 'bg-slate-500',
  markdown: 'bg-slate-500',
  txt: 'bg-slate-500',
  json: 'bg-amber-500',
  xml: 'bg-amber-500',
  html: 'bg-amber-500',
  log: 'bg-slate-500',
};

/** Unknown extensions get the neutral tile rather than no tile. */
const FALLBACK = 'bg-slate-400';

export function FileTypeChip({ filename }: { filename: string }) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const label = extension.slice(0, 4).toUpperCase() || 'FILE';

  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-md text-[9px] font-bold tracking-tight text-white',
        PALETTE[extension] ?? FALLBACK,
      )}
      title={extension ? `.${extension}` : undefined}
    >
      {label}
    </span>
  );
}
