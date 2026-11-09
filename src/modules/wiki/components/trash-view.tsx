'use client';

import { FileText, Folder, RotateCcw, Trash, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageLayout } from '@/components/layout/page-layout';
import { WikiHeader } from '@/modules/wiki/components/page-header';
import { Button, Confirm, EmptyState, IconButton, useToast } from '@/components/ui';
import { useWiki } from '@/modules/wiki/components/wiki-provider';
import { api, urls } from '@/modules/wiki/lib/api';
import type { TrashEntry } from '@/modules/wiki/lib/api-types';
import { daysUntil } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';

const TRASH_DAYS = 30;

/** What was deleted in the last 30 days, to bring back or delete for good. */
export function TrashView({ entries: initial }: { entries: TrashEntry[] }) {
  const t = useTranslations('wiki.trash');
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const { refresh } = useWiki();
  const [entries, setEntries] = useState(initial);
  const [forever, setForever] = useState<TrashEntry | null>(null);
  const [emptying, setEmptying] = useState(false);

  const restore = async (entry: TrashEntry): Promise<void> => {
    try {
      const { path } = await api.restore(entry.id);
      setEntries(current => current.filter(other => other.id !== entry.id));
      refresh();
      toast.show(t('restored', { title: entry.title }), 'success', { label: t('open'), run: () => router.push(urls.page(path)) });
    } catch (error) {
      toast.show(apiError(error, 'restoreFailed'), 'error');
    }
  };

  const remove = async (entry: TrashEntry): Promise<void> => {
    try {
      await api.deleteForever(entry.id);
      setEntries(current => current.filter(other => other.id !== entry.id));
      setForever(null);
      toast.show(t('deleted', { title: entry.title }));
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const empty = async (): Promise<void> => {
    try {
      await api.emptyTrash();
      setEntries([]);
      setEmptying(false);
      toast.show(t('emptied'));
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  return (
    <PageLayout
      header={
        <WikiHeader
          icon={<Trash size={18} />}
          title={t('title')}
          action={
            entries.length > 0 ? (
              <Button variant="outline" icon={<Trash2 size={16} />} onClick={() => setEmptying(true)} className="text-danger">
                {t('empty')}
              </Button>
            ) : null
          }
        />
      }
    >
      {entries.length === 0 ? (
        <EmptyState className="py-20" icon={<Trash size={24} />} title={t('nothing')} />
      ) : (
        <ul className="mx-auto max-w-4xl divide-y divide-line rounded-xl border border-line bg-card">
          {entries.map(entry => {
            const Icon = entry.kind === 'folder' ? Folder : FileText;
            const left = daysUntil(entry.deletedAt, TRASH_DAYS);
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <Icon size={18} aria-hidden="true" className={entry.kind === 'folder' ? 'shrink-0 text-accent' : 'shrink-0 text-ink-muted'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{entry.title || t('untitled')}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {[
                      entry.from ? t('from', { folder: entry.from }) : t('fromTop'),
                      entry.inside > 0 ? t('inside', { count: entry.inside }) : null,
                      format.dateTime(new Date(entry.deletedAt), { dateStyle: 'medium' }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="text-sm text-ink-faint tabular-nums">{t('daysLeft', { count: left })}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" icon={<RotateCcw size={15} />} onClick={() => void restore(entry)}>
                    {t('restore')}
                  </Button>
                  <IconButton
                    label={t('deleteForever', { title: entry.title })}
                    icon={<Trash2 size={17} />}
                    onClick={() => setForever(entry)}
                    className="hover:bg-danger-soft hover:text-danger"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Confirm
        open={forever !== null}
        title={t('foreverTitle')}
        confirmLabel={t('foreverConfirm')}
        danger
        onCancel={() => setForever(null)}
        onConfirm={() => (forever ? remove(forever) : undefined)}
      >
        {forever ? t('foreverBody', { title: forever.title }) : null}
      </Confirm>
      <Confirm open={emptying} title={t('emptyTitle')} confirmLabel={t('emptyConfirm')} danger onCancel={() => setEmptying(false)} onConfirm={empty}>
        {t('emptyBody', { count: entries.length })}
      </Confirm>
    </PageLayout>
  );
}
