'use client';

import { Markdown as SuiteMarkdown } from '@/components/markdown';
import { cn } from '@/lib/cn';

/** Markdown in a card, a to-do or a note, in Tasks' compact style. `plain` leaves out GitHub's tables and task lists. */
export function Markdown({ children, className, plain = false }: { children: string; className?: string; plain?: boolean }) {
  return (
    <SuiteMarkdown className={cn('markdown-content', className)} plain={plain}>
      {children}
    </SuiteMarkdown>
  );
}
