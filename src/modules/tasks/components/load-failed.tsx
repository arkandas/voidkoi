'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, EmptyState } from '@/components/ui';

/** What couldn't be loaded, and a way to try again. */
export function LoadFailed({ message, onRetry, className }: { message: string; onRetry(): void; className?: string }) {
  const t = useTranslations('tasks.actions');
  return (
    <EmptyState
      className={className}
      icon={<TriangleAlert size={24} />}
      title={message}
      action={
        <Button variant="outline" icon={<RefreshCw size={16} />} onClick={onRetry}>
          {t('tryAgain')}
        </Button>
      }
    />
  );
}
