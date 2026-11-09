import type { LabelHTMLAttributes } from 'react';

import { labelClasses } from '@/components/ui';
import { cn } from '@/lib/cn';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

/** A field's label, the kit's look, for fields the kit doesn't draw: ranges, groups of choices, file drops. */
export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label className={cn(labelClasses, className)} {...props}>
      {children}
      {required ? <span className="ml-1 text-danger">*</span> : null}
    </label>
  );
}
