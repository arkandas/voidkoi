import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  /** A 24px lucide icon. */
  icon: ReactNode;
  title: string;
  /** One line. If it needs two, the empty state is doing too much. */
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span
        aria-hidden="true"
        className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-ink-muted dark:bg-card"
      >
        {icon}
      </span>
      <p className="text-lg font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
