import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type AlertTone = 'danger' | 'success' | 'warning' | 'info';

const TONES: Record<AlertTone, { classes: string; icon: typeof Info }> = {
  danger: { classes: 'border-danger/40 bg-danger-soft text-danger', icon: AlertTriangle },
  success: { classes: 'border-success/40 bg-success-soft text-success', icon: CheckCircle2 },
  warning: { classes: 'border-warning/40 bg-warning-soft text-warning', icon: TriangleAlert },
  info: { classes: 'border-line-strong bg-muted text-ink-muted', icon: Info },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
}

export function Alert({ tone = 'danger', title, className, children, ...props }: AlertProps) {
  const { classes, icon: Icon } = TONES[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium', classes, className)}
      {...props}
    >
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
