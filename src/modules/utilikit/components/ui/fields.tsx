'use client';

import { Textarea as KitTextarea, type TextareaProps } from '@/components/ui';
import { cn } from '@/lib/cn';

/** The kit's text area, four lines to start with and taller when dragged, for the text a tool works on. */
export function Textarea({ rows = 4, className, ...props }: TextareaProps) {
  return <KitTextarea rows={rows} className={cn('min-h-20 resize-y', className)} {...props} />;
}
