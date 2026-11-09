'use client';

import { useId, type Ref, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { fieldClasses, fieldErrorClasses, labelClasses, verbatim } from './input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  /** Styles the wrapper, e.g. to let the field flex inside a row. */
  containerClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  error,
  className,
  containerClassName,
  id,
  ref,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label htmlFor={textareaId} className={labelClasses}>
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        {...verbatim(props.spellCheck)}
        aria-invalid={error ? true : undefined}
        className={cn(
          fieldClasses,
          'themed-scroll block resize-none px-3.5 py-2.5 text-base leading-relaxed sm:text-sm',
          error && fieldErrorClasses,
          className,
        )}
        {...props}
      />
      {error ? <p className="mt-1.5 text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
