'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Card, CardTitle, Spinner } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { FilesStatusProvider, useFilesStatus } from '@/modules/files/components/files-status';
import { StorageMeter } from '@/modules/files/components/layout/storage-meter';

function Storage() {
  const t = useTranslations('files.settings.storage');
  const locale = useLocale();
  const { status } = useFilesStatus();
  if (!status) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <StorageMeter status={status} bare className="mt-3" />
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-ink-muted">{t('limit')}</dt>
        <dd className="font-medium text-ink tabular-nums">{status.quota !== null ? formatBytes(status.quota, locale) : t('none')}</dd>
        {status.quota !== null ? (
          <>
            <dt className="text-ink-muted">{t('free')}</dt>
            <dd className="font-medium text-ink tabular-nums">{formatBytes(Math.max(0, status.quota - status.usage), locale)}</dd>
          </>
        ) : null}
        {status.maxUploadBytes !== null ? (
          <>
            <dt className="text-ink-muted">{t('largestFile')}</dt>
            <dd className="font-medium text-ink tabular-nums">{formatBytes(status.maxUploadBytes, locale)}</dd>
          </>
        ) : null}
      </dl>
    </Card>
  );
}

/** Files in Settings: how much is stored, and the limits that apply. */
export default function FilesSettings() {
  return (
    <FilesStatusProvider>
      <Storage />
    </FilesStatusProvider>
  );
}
