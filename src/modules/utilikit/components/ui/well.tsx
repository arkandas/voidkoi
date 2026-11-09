import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface WellProps extends HTMLAttributes<HTMLDivElement> {
  mono?: boolean;
}

/** A sunken box for a result or a value inside a card. */
export function Well({ className, mono = false, ...props }: WellProps) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-canvas px-3.5 py-3 text-sm text-ink', mono && 'font-mono wrap-anywhere', className)}
      {...props}
    />
  );
}
