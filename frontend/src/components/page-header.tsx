import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Buttons that act on the whole page, kept on the far side of the title. */
  actions?: ReactNode;
}

/**
 * The heading every page opens with: a tinted badge, the name, one line of
 * what the page is for.
 *
 * A single component rather than the same three elements written out six
 * times — the badge size and the gap between title and description are the
 * kind of thing that drifts a pixel per page when each one owns its own copy.
 */
export function PageHeader({ icon: Icon, title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-lighter">
          <Icon className="size-5 text-primary-base" />
        </span>
        <div className="pt-0.5">
          <h1 className="text-2xl font-semibold tracking-tight text-text-strong-950">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-text-sub-600">{description}</p>}
        </div>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
