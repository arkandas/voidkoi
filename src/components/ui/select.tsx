'use client';

import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { fieldClasses, fieldErrorClasses, labelClasses } from './input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  /** A lucide icon, drawn inside the field's leading edge. */
  icon?: ReactNode;
  options: readonly SelectOption[];
  error?: string | null;
}

/**
 * A styled native `<select>`.
 *
 * Native on purpose: the operating system's own picker is keyboard and screen
 * reader correct everywhere, opens the right way on a phone, and cannot be
 * scrolled off the edge of a small window — none of which a hand-rolled
 * listbox gets for free.
 */
export function Select({
  label,
  icon,
  options,
  error,
  className,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={selectId} className={labelClasses}>
          {label}
        </label>
      ) : null}

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${selectId}-error` : undefined}
          className={cn(
            'peer',
            fieldClasses,
            'h-11 cursor-pointer appearance-none truncate pr-10 text-base sm:h-10 sm:text-sm',
            icon ? 'pl-10' : 'pl-3.5',
            error && fieldErrorClasses,
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint transition-colors peer-focus:text-accent"
          >
            {icon}
          </span>
        ) : null}

        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
        />
      </div>

      {error ? (
        <p id={`${selectId}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
