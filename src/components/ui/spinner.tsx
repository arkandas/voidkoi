import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';

export interface SpinnerProps {
  className?: string;
  label?: string;
  size?: number;
}

export function Spinner({ className, label, size = 22 }: SpinnerProps) {
  const t = useTranslations('common');
  return (
    <span role="status" aria-label={label ?? t('loading')} className={cn('inline-flex text-ink-faint', className)}>
      <Loader2 size={size} aria-hidden="true" className="animate-spin" />
    </span>
  );
}
