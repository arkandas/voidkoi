import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** The same four buttons as Notes, Tasks, Talk and Utilikit. */
const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-accent text-accent-ink hover:bg-accent-hover focus-visible:ring-accent/25 active:bg-accent-hover',
  outline: 'border border-line-strong bg-surface text-ink hover:bg-muted focus-visible:ring-accent/25 active:bg-muted',
  ghost: 'text-ink hover:bg-muted focus-visible:ring-line-strong active:bg-muted',
  destructive: 'bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/25',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A 16px lucide icon, drawn before the label. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap',
        'transition-all duration-200 focus:outline-hidden focus-visible:ring-4',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {icon ? <span className="-ml-0.5 shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}
