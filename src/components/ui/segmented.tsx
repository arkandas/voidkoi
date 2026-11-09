'use client';

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  ariaLabel?: string;
  /** Stacks the icon over the label, as in the theme picker. */
  stacked?: boolean;
  /** Icons only: the labels name the buttons for screen readers and tooltips. */
  iconOnly?: boolean;
  /** Equal columns across the whole width. */
  fullWidth?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A row of mutually exclusive choices, the way every app in the suite draws
 * one. Without `fullWidth` it wraps onto a second line rather than running out
 * of a narrow card.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  stacked = false,
  iconOnly = false,
  fullWidth = false,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const grid = stacked || fullWidth;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={grid ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
      className={cn(
        'gap-0.5 rounded-lg border border-line bg-muted p-0.5 dark:bg-canvas',
        grid ? 'grid' : 'inline-flex max-w-full flex-wrap items-center',
        fullWidth && 'w-full',
        className,
      )}
    >
      {options.map(({ value: optionValue, label, icon: Icon, disabled }) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={iconOnly ? label : undefined}
            title={iconOnly ? label : undefined}
            onClick={() => onChange(optionValue)}
            className={cn(
              'flex min-w-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              stacked
                ? 'flex-col gap-1 py-1.5 text-[11px]'
                : iconOnly
                  ? 'h-9 w-10 sm:h-8 sm:w-9'
                  : size === 'sm'
                    ? 'h-8 gap-1 px-2.5 text-xs sm:h-7'
                    : 'h-9 gap-1.5 px-3 text-[13px] sm:h-8',
              active
                ? 'bg-raised font-semibold text-ink shadow-sm ring-1 ring-line dark:bg-line-strong dark:ring-0'
                : 'font-medium text-ink-muted hover:text-ink',
            )}
          >
            {Icon ? <Icon size={stacked ? 15 : size === 'sm' ? 14 : 16} aria-hidden="true" className="shrink-0" /> : null}
            {iconOnly ? null : <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
