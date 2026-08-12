import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // A badge is a label, not a paragraph: it keeps one line and lets the column
  // around it be the thing that gives way.
  'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-lighter text-primary-dark',
        secondary: 'border-stroke-soft-200 bg-bg-weak-50 text-text-sub-600',
        success: 'border-transparent bg-success-light text-success-base',
        destructive: 'border-transparent bg-danger-light text-danger-base',
        outline: 'border-stroke-soft-200 text-text-sub-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps a document status onto the badge palette. */
export function statusVariant(status: string): NonNullable<BadgeProps['variant']> {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}
