'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

import { cn } from '@/lib/cn';

/** The field look every app in the family shares: inputs, selects, textareas. */
export const fieldClasses =
  'w-full rounded-lg border border-line-strong bg-raised text-ink shadow-xs transition-colors ' +
  'placeholder:text-ink-faint hover:border-ink-faint ' +
  'focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const fieldErrorClasses = 'border-danger hover:border-danger focus:border-danger focus:ring-danger/15';

export const labelClasses = 'mb-1.5 block text-sm font-medium text-ink-muted';

/** Text typed exactly as it is, like a hash or a URL, when spellcheck is off: a phone doesn't capitalize or correct it either. */
export function verbatim(spellCheck: boolean | 'true' | 'false' | undefined): { autoCapitalize?: string; autoCorrect?: string } {
  return spellCheck === false || spellCheck === 'false' ? { autoCapitalize: 'off', autoCorrect: 'off' } : {};
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  /** A lucide icon, drawn inside the field's leading edge. */
  icon?: ReactNode;
  error?: string | null;
  /** `lg` is the tall field of the sign-in page. */
  size?: 'sm' | 'md' | 'lg';
  ref?: Ref<HTMLInputElement>;
}

const SIZES = {
  sm: 'h-9 text-base sm:h-8 sm:text-sm',
  md: 'h-11 text-base sm:h-10 sm:text-sm',
  lg: 'h-[52px] text-[17px]',
} as const;

export function Input({
  label,
  icon,
  error,
  size = 'md',
  className,
  id,
  ref,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className={labelClasses}>
          {label}
        </label>
      ) : null}

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          {...verbatim(props.spellCheck)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'peer',
            fieldClasses,
            SIZES[size],
            icon ? (size === 'lg' ? 'pr-4 pl-11' : 'pr-3.5 pl-10') : 'px-3.5',
            error && fieldErrorClasses,
            className,
          )}
          {...props}
        />
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 flex items-center text-ink-faint transition-colors peer-focus:text-accent',
              size === 'lg' ? 'left-3.5' : 'left-3',
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
