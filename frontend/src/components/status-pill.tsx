import { AlertCircle, CheckCircle2, Copy, Loader2, Upload } from 'lucide-react';
import { statusLabel } from '@/features/documents/document-types';
import { cn } from '@/lib/utils';

/**
 * A document's state as a coloured pill with the icon that goes with it.
 *
 * The icon carries the meaning as well as the colour does, which is what keeps
 * the column readable for someone who cannot separate red from green.
 */
const STYLES: Record<string, { className: string; icon: typeof CheckCircle2; spin?: boolean }> = {
  completed: { className: 'bg-success-light text-success-base', icon: CheckCircle2 },
  failed: { className: 'bg-danger-light text-danger-base', icon: AlertCircle },
  processing: { className: 'bg-warning-light text-warning-base', icon: Loader2, spin: true },
  uploaded: { className: 'bg-primary-lighter text-primary-dark', icon: Upload },
  duplicate: { className: 'bg-bg-weak-50 text-text-sub-600', icon: Copy },
};

const FALLBACK = { className: 'bg-bg-weak-50 text-text-sub-600', icon: AlertCircle };

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const { className, icon: Icon, spin } = STYLES[status] ?? FALLBACK;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin')} />
      {label ?? statusLabel(status)}
    </span>
  );
}
