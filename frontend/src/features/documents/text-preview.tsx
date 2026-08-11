import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface HighlightSpan {
  id: string;
  type: string;
  mentionText: string;
  charStart: number | null;
  charEnd: number | null;
}

const TYPE_COLORS: Record<string, string> = {
  company: 'bg-blue-200',
  person: 'bg-emerald-200',
  date: 'bg-violet-200',
  amount: 'bg-amber-200',
  project: 'bg-pink-200',
  department: 'bg-cyan-200',
};

interface Props {
  text: string;
  spans: HighlightSpan[];
  /** Mention currently hovered in the metadata panel. */
  activeId?: string | null;
}

/**
 * Renders the extracted text with entity mentions marked.
 *
 * Slicing by offset, never regex replace: the same company name can appear
 * five times in a contract and only the recorded occurrence is the one the
 * extractor actually used. A replace would light up all five and quietly
 * imply the model found evidence it never looked at.
 *
 * Offsets come from `indexOf` over this exact stored string, so no
 * normalisation happens here — re-folding the text at render time would shift
 * every position after the first Vietnamese character.
 */
export function TextPreview({ text, spans, activeId }: Props) {
  const activeRef = useRef<HTMLElement | null>(null);

  const segments = useMemo(() => {
    const usable = spans
      .filter(
        (span): span is HighlightSpan & { charStart: number; charEnd: number } =>
          span.charStart !== null && span.charEnd !== null && span.charEnd <= text.length,
      )
      .sort((a, b) => a.charStart - b.charStart);

    const result: { text: string; span?: HighlightSpan }[] = [];
    let cursor = 0;

    for (const span of usable) {
      // Overlapping mentions would produce nested marks and duplicated text;
      // the first one wins and the rest are skipped.
      if (span.charStart < cursor) continue;
      if (span.charStart > cursor) result.push({ text: text.slice(cursor, span.charStart) });
      result.push({ text: text.slice(span.charStart, span.charEnd), span });
      cursor = span.charEnd;
    }

    if (cursor < text.length) result.push({ text: text.slice(cursor) });
    return result;
  }, [text, spans]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeId]);

  return (
    <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed">
      {segments.map((segment, index) =>
        segment.span ? (
          <mark
            key={`${segment.span.id}-${index}`}
            ref={segment.span.id === activeId ? activeRef : undefined}
            title={segment.span.type}
            className={cn(
              'rounded px-0.5 text-foreground',
              TYPE_COLORS[segment.span.type] ?? 'bg-slate-200',
              segment.span.id === activeId && 'ring-2 ring-foreground',
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </pre>
  );
}
