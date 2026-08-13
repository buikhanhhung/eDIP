import type { LucideIcon } from 'lucide-react';

/**
 * One thing the pipeline does, said before it happens rather than discovered
 * afterwards from a document that came back classified.
 *
 * Shared by the pages that put files into the system — upload and Sources —
 * because the promise is the same on both: a file dropped in the browser and
 * one pulled from Drive go through the same extraction, classification and
 * duplicate check, and telling that story two different ways would suggest
 * they do not.
 */
export function Capability({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  /** Background and text classes for the glyph, e.g. `bg-success-light text-success-base`. */
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-text-strong-950">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-sub-600">{body}</p>
      </div>
    </div>
  );
}
