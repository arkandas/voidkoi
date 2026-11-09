'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  /** A line under the label. */
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** An on/off setting with its label beside it, the whole row clickable. */
export function Switch({ checked, onChange, label, description, disabled = false, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className={cn('min-w-0 flex-1', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-ink-muted">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
          'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-[18px] rounded-full shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[22px] bg-accent-ink' : 'translate-x-[2px] bg-raised dark:bg-ink-faint',
          )}
        />
      </button>
    </div>
  );
}
