import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * `inverse` is for a count sitting on an accent fill — the selected row, the
 * current tab — where an accent badge would vanish into its own background.
 */
export type BadgeTone = 'accent' | 'danger' | 'neutral' | 'success' | 'inverse';

const CHIPS: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft text-accent',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  neutral: 'border border-line-strong text-ink-muted',
  inverse: 'bg-accent-ink text-accent',
};

const COUNTS: Record<BadgeTone, string> = {
  accent: 'bg-accent text-accent-ink',
  danger: 'bg-danger text-accent-ink',
  success: 'bg-success text-accent-ink',
  neutral: 'bg-line-strong text-ink',
  inverse: 'bg-accent-ink text-accent',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** A count is a solid pill with a minimum width, so 1 and 12 line up. */
  count?: boolean;
  className?: string;
}

export function Badge({ children, tone = 'accent', count = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        count
          ? 'h-[18px] min-w-[18px] px-1.5 text-[11px] font-semibold tabular-nums'
          : 'gap-1 px-2 py-0.5 text-xs font-medium',
        count ? COUNTS[tone] : CHIPS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
