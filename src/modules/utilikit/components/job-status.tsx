'use client';

import { AlertCircle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Card, Spinner } from '@/components/ui';
import { Progress } from '@/modules/utilikit/components/ui/progress';
import { useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { formatDuration } from '@/lib/format';

export function JobProgressCard({ title, progress }: { title: string; progress?: number }) {
  const tc = useTranslations('utilikit.common');

  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
        <Spinner size={40} className="text-accent" label={title} />
        <h3 className="text-xl font-semibold text-ink">{title}</h3>
        {progress !== undefined ? <p className="text-sm text-ink-muted">{tc('progress', { value: progress / 100 })}</p> : null}
        <Progress value={progress ?? 0} label={title} className="max-w-md" />
      </div>
    </Card>
  );
}

interface JobFailedCardProps {
  title: string;
  error: string;
  message?: string;
  detail?: string;
  onRetry: () => void;
}

export function JobFailedCard({ title, error, message, detail, onRetry }: JobFailedCardProps) {
  const tc = useTranslations('utilikit.common');
  const errorMessage = useErrorMessage();

  return (
    <Card className="border-danger/40 bg-danger-soft">
      <div className="flex items-start gap-3">
        <AlertCircle size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 text-lg font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{message ?? errorMessage(error)}</p>
          {detail ? (
            <p className="mt-2 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap text-ink-faint wrap-anywhere">{detail}</p>
          ) : null}
          <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
            {tc('tryAgain')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function FileExpiry({ secondsLeft, expired }: { secondsLeft: number; expired: string }) {
  const tc = useTranslations('utilikit.common');

  return secondsLeft > 0 ? (
    <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
      <Clock size={16} aria-hidden="true" className="shrink-0" />
      {tc('availableFor', { time: formatDuration(secondsLeft) })}
    </p>
  ) : (
    <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
      <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
      {expired}
    </p>
  );
}
