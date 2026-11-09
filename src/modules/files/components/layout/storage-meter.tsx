'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { FilesStatusDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

/** A whole percentage; "<1%" for a sliver, so a little use never reads as none. */
function percent(fraction: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  return fraction > 0 && fraction < 0.01 ? `<${format.format(0.01)}` : format.format(fraction);
}

/**
 * How much of their space someone uses: of their limit, or of the disk when
 * they have none. `bare` leaves out the box and the label, for a card that
 * already says Storage.
 */
export function StorageMeter({ status, bare = false, className }: { status: FilesStatusDto; bare?: boolean; className?: string }) {
  const t = useTranslations('files.storage');
  const locale = useLocale();
  const used = formatBytes(status.usage, locale);
  const limit = status.quota ?? status.disk?.total ?? null;
  const fraction = limit ? Math.min(1, status.usage / limit) : null;
  const strong = (chunks: ReactNode) => <b className="font-semibold text-ink">{chunks}</b>;

  return (
    <div className={cn(!bare && 'rounded-xl border border-line bg-card p-3 shadow-xs', className)}>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px] tabular-nums">
        {bare ? null : <span className="font-medium text-ink-muted">{t('label')}</span>}
        <span className="truncate text-ink-muted">
          {limit !== null ? t.rich('usedOf', { used, quota: formatBytes(limit, locale), b: strong }) : t.rich('used', { used, b: strong })}
        </span>
      </div>
      {fraction !== null ? (
        <div className="mt-2 flex items-center gap-2.5">
          <div
            role="progressbar"
            aria-label={t('label')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-500', fraction > 0.9 ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${Math.max(fraction > 0 ? 2 : 0, fraction * 100)}%` }}
            />
          </div>
          <span className={cn('text-xs font-semibold tabular-nums', fraction > 0.9 ? 'text-danger' : 'text-ink')}>{percent(fraction, locale)}</span>
        </div>
      ) : null}
    </div>
  );
}
