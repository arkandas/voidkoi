'use client';

import { RotateCcw, Trash, TrashOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useFilesStatus } from '@/modules/files/components/files-status';
import { FileTile } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { Button, Confirm, EmptyState, IconButton, Spinner, useToast } from '@/components/ui';
import { api } from '@/modules/files/lib/api';
import type { TrashEntry } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { daysUntil, formatBytes, formatDate } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';

/** How long things stay, as the server keeps them. */
const TRASH_DAYS = 30;

export default function TrashPage() {
  const t = useTranslations('files.trash');
  const tFiles = useTranslations('files.browser');
  const locale = useLocale();
  const toast = useToast();
  const apiError = useApiError();
  const { refresh } = useFilesStatus();
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [deleting, setDeleting] = useState<TrashEntry | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  // The list is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.trashList().then(
      found => {
        if (!cancelled) setEntries(found);
      },
      (error: unknown) => {
        if (cancelled) return;
        toast.show(apiError(error, 'loadFailed'), 'error');
        setEntries([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [toast, apiError]);

  const without = (id: number) => setEntries(current => current?.filter(entry => entry.item.id !== id) ?? null);

  const restore = async (entry: TrashEntry): Promise<void> => {
    setBusy(entry.item.id);
    try {
      const item = await api.restore(entry.item.id);
      without(entry.item.id);
      toast.show(item.name === entry.item.name ? t('restored', { name: item.name }) : t('restoredAs', { name: item.name }), 'success');
    } catch (error) {
      toast.show(apiError(error, 'restoreFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const deleteForever = async (entry: TrashEntry): Promise<void> => {
    try {
      await api.deleteForever(entry.item.id);
      without(entry.item.id);
      setDeleting(null);
      void refresh();
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const empty = async (): Promise<void> => {
    try {
      await api.emptyTrash();
      setEntries([]);
      setEmptying(false);
      void refresh();
      toast.show(t('emptied'), 'success');
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          icon={<Trash size={18} />}
          title={t('title')}
          action={
            entries && entries.length > 0 ? (
              <Button variant="outline" icon={<TrashOff size={16} />} onClick={() => setEmptying(true)} className="text-danger">
                {t('empty')}
              </Button>
            ) : null
          }
        />
      }
    >
      {entries === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState className="py-20" icon={<Trash size={24} />} title={t('nothing')} />
      ) : (
        <ul className="space-y-1">
          {entries.map(entry => {
            const left = daysUntil(entry.deletedAt, TRASH_DAYS);
            return (
              <li key={entry.item.id} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted">
                <FileTile kind={entry.item.kind} mime={entry.item.mime} name={entry.item.name} className="opacity-80" />
                <div className="min-w-0 flex-1">
                  <FileName name={entry.item.name} folder={entry.item.kind === 'folder'} className="text-[15px] font-semibold text-ink" />
                  <p className="truncate text-sm text-ink-muted">
                    {t('from', { folder: entry.from ?? tFiles('title'), date: formatDate(entry.deletedAt, locale) })}
                  </p>
                </div>
                <span className="hidden text-sm text-ink-muted tabular-nums sm:block">{formatBytes(entry.size, locale)}</span>
                <span
                  className={cn(
                    'hidden h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap md:inline-flex',
                    left <= 3 ? 'bg-danger-soft text-danger' : 'bg-muted text-ink-muted dark:bg-canvas',
                  )}
                >
                  {t('daysLeft', { count: left })}
                </span>
                <Button size="sm" variant="outline" icon={<RotateCcw size={15} />} disabled={busy === entry.item.id} onClick={() => void restore(entry)}>
                  {t('restore')}
                </Button>
                <IconButton
                  label={t('deleteForever', { name: entry.item.name })}
                  icon={<TrashOff size={18} />}
                  onClick={() => setDeleting(entry)}
                  className="hover:bg-danger-soft hover:text-danger"
                />
              </li>
            );
          })}
        </ul>
      )}

      <Confirm
        open={deleting !== null}
        title={t('deleteTitle')}
        confirmLabel={t('deleteConfirm')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => (deleting ? deleteForever(deleting) : undefined)}
      >
        {deleting ? t('deleteBody', { name: deleting.item.name }) : null}
      </Confirm>
      <Confirm open={emptying} title={t('emptyTitle')} confirmLabel={t('emptyConfirm')} danger onCancel={() => setEmptying(false)} onConfirm={empty}>
        {t('emptyBody', { count: entries?.length ?? 0 })}
      </Confirm>
    </PageLayout>
  );
}
