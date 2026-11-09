'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type IconButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'stage';
export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<IconButtonVariant, string> = {
  default: 'bg-accent text-accent-ink hover:bg-accent-hover focus-visible:ring-accent/25',
  outline: 'border border-line-strong bg-raised text-ink hover:bg-muted focus-visible:ring-accent/25 dark:bg-card',
  ghost: 'text-ink-muted hover:bg-muted hover:text-ink focus-visible:ring-line-strong',
  destructive: 'bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/25',
  // Over the viewer's dark stage, in either theme.
  stage: 'bg-white/15 text-stage-ink backdrop-blur-sm hover:bg-white/25 focus-visible:ring-white/30',
};

const SIZES: Record<IconButtonSize, string> = {
  xs: 'size-7 rounded-md',
  sm: 'size-8 rounded-lg',
  md: 'size-10 rounded-lg',
  lg: 'size-12 rounded-full',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button must still name itself. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

/**
 * An icon-only button. The label becomes both the accessible name and the
 * native tooltip, so it is never nameless.
 */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-colors duration-150 focus:outline-hidden focus-visible:ring-4',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
