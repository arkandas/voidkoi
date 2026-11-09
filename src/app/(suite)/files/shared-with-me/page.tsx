'use client';

import { Download, MoreHorizontal, Star, StarOff, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { FavoriteMark } from '@/modules/files/components/favorite-mark';
import { FileTile } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { appSource, Viewer } from '@/modules/files/components/viewer';
import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { useFilesStatus } from '@/modules/files/components/files-status';
import { ActionMenu, Avatar, EmptyState, Spinner, useToast } from '@/components/ui';
import { api, download, urls } from '@/modules/files/lib/api';
import type { ItemDto, SharedWithMeItem } from '@/modules/files/lib/api-types';
import { formatBytes, formatDate } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';


/** What other people shared with me, newest first. A folder opens read-only. */
export default function SharedWithMePage() {
  const t = useTranslations('files.sharedWithMe');
  const tFiles = useTranslations('files.browser');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const { status, refresh } = useFilesStatus();
  const [entries, setEntries] = useState<SharedWithMeItem[] | null>(null);
  const [viewing, setViewing] = useState<{ items: ItemDto[]; index: number } | null>(null);

  /** What was shared with me, or nothing once the error is shown. */
  const fetchEntries = useCallback(async (): Promise<SharedWithMeItem[]> => {
    try {
      const found = await api.sharedWithMe();
      // Seen now: the badge goes.
      void api.markSharesSeen().then(refresh, () => {});
      return found;
    } catch (error) {
      toast.show(apiError(error, 'loadFailed'), 'error');
      return [];
    }
  }, [toast, apiError, refresh]);

  // The list is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    void fetchEntries().then(found => {
      if (!cancelled) setEntries(found);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchEntries]);

  // Something shared while this page is open shows up in it.
  const fresh = status?.newShares ?? 0;
  useEffect(() => {
    if (fresh <= 0) return;
    let cancelled = false;
    void fetchEntries().then(found => {
      if (!cancelled) setEntries(found);
    });
    return () => {
      cancelled = true;
    };
  }, [fresh, fetchEntries]);

  const files = entries?.map(entry => entry.item).filter(item => item.kind === 'file') ?? [];

  const open = (item: ItemDto): void => {
    if (item.kind === 'folder') router.push(`/files/shared-with-me/${item.id}`);
    else setViewing({ items: files, index: Math.max(0, files.findIndex(file => file.id === item.id)) });
  };

  const setFavorite = async (item: ItemDto, favorite: boolean): Promise<void> => {
    const mark = (value: boolean): void =>
      setEntries(current => current?.map(entry => (entry.item.id === item.id ? { ...entry, item: { ...entry.item, favorite: value } } : entry)) ?? null);
    mark(favorite);
    try {
      await api.setFavorite(item.id, favorite);
    } catch (error) {
      mark(!favorite);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const leave = async (entry: SharedWithMeItem): Promise<void> => {
    try {
      await api.leaveShare(entry.item.id);
      setEntries(current => current?.filter(other => other.item.id !== entry.item.id) ?? null);
      toast.show(t('removed', { name: entry.item.name }), 'success');
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  return (
    <PageLayout header={<PageHeader icon={<Users size={18} />} title={t('title')} />}>
      {entries === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState className="py-20" icon={<Users size={24} />} title={t('empty')} />
      ) : (
        <ul className="space-y-1">
          {entries.map(entry => {
            const { item, owner } = entry;
            return (
              <li
                key={item.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
                onClick={() => open(item)}
              >
                <FileTile kind={item.kind} mime={item.mime} name={item.name} thumbnail={item.hasThumbnail ? urls.thumbnail(item) : null} />
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileName name={item.name} folder={item.kind === 'folder'} className="text-[15px] font-semibold text-ink" />
                    <FavoriteMark item={item} />
                  </span>
                  <p className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
                    <Avatar person={owner} size="xs" />
                    {t('from', { name: owner.username, date: formatDate(entry.sharedAt, locale) })}
                  </p>
                </div>
                <span className="hidden text-sm text-ink-muted tabular-nums sm:block">
                  {item.kind === 'folder' ? tFiles('itemCount', { count: item.childCount ?? 0 }) : formatBytes(item.size, locale)}
                </span>
                <ActionMenu
                  label={tFiles('actions.label', { name: item.name })}
                  triggerClassName="size-9"
                  actions={[
                    {
                      label: tFiles('actions.download'),
                      icon: Download,
                      onSelect: () => download(item.kind === 'file' ? urls.content(item.id, true) : urls.zip([item.id], item.name)),
                    },
                    {
                      label: item.favorite ? tFiles('actions.unfavorite') : tFiles('actions.favorite'),
                      icon: item.favorite ? StarOff : Star,
                      onSelect: () => void setFavorite(item, !item.favorite),
                    },
                    { label: t('remove'), icon: X, danger: true, onSelect: () => void leave(entry) },
                  ]}
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                </ActionMenu>
              </li>
            );
          })}
        </ul>
      )}

      {viewing ? (
        <Viewer
          items={viewing.items}
          index={viewing.index}
          source={appSource}
          onIndex={index => setViewing(current => (current ? { ...current, index } : current))}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </PageLayout>
  );
}
