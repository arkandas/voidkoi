'use client';

import { Download, Eye, FolderOpen, MoreHorizontal, Star, StarOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FileTile } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { appSource, Viewer } from '@/modules/files/components/viewer';
import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { ActionMenu, Avatar, EmptyState, IconButton, Spinner, useToast } from '@/components/ui';
import { api, download, urls } from '@/modules/files/lib/api';
import type { FavoriteEntry, ItemDto } from '@/modules/files/lib/api-types';
import { formatBytes } from '@/lib/format';
import { sortItems } from '@/modules/files/lib/sort';
import { useApiError } from '@/lib/use-api-error';

/** What you starred, folders first and by name: your own, and what was shared with you. */
export default function FavoritesPage() {
  const t = useTranslations('files.favorites');
  const tFiles = useTranslations('files.browser');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const [entries, setEntries] = useState<FavoriteEntry[] | null>(null);
  const [viewing, setViewing] = useState<{ items: ItemDto[]; index: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await api.favorites());
    } catch (error) {
      toast.show(apiError(error, 'loadFailed'), 'error');
      setEntries([]);
    }
  }, [toast, apiError]);

  // The first look. The list is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.favorites().then(
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

  const sorted = useMemo(() => {
    const byId = new Map(entries?.map(entry => [entry.item.id, entry]));
    return sortItems(entries?.map(entry => entry.item) ?? [], { key: 'name', direction: 'asc' }, locale).map(item => byId.get(item.id)!);
  }, [entries, locale]);

  const files = sorted.map(entry => entry.item).filter(item => item.kind === 'file');
  const mine = useMemo(() => new Set(entries?.filter(entry => !entry.owner).map(entry => entry.item.id)), [entries]);

  const open = (entry: FavoriteEntry): void => {
    const { item } = entry;
    if (item.kind === 'folder') router.push(`${entry.owner ? '/files/shared-with-me' : '/files'}/${item.id}`);
    else setViewing({ items: files, index: Math.max(0, files.findIndex(file => file.id === item.id)) });
  };

  const unstar = async (entry: FavoriteEntry): Promise<void> => {
    try {
      await api.setFavorite(entry.item.id, false);
      setEntries(current => current?.filter(other => other.item.id !== entry.item.id) ?? null);
      toast.show(t('removed', { name: entry.item.name }), 'info', {
        label: tFiles('undo'),
        run: () => {
          void api.setFavorite(entry.item.id, true).then(load, error => toast.show(apiError(error, 'saveFailed'), 'error'));
        },
      });
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  /** A text file of yours edited in the viewer: its new size and date, here and in the viewer. */
  const saved = useCallback((item: ItemDto): void => {
    setEntries(current => current?.map(entry => (entry.item.id === item.id ? { ...entry, item: { ...entry.item, ...item } } : entry)) ?? null);
    setViewing(current =>
      current ? { ...current, items: current.items.map(other => (other.id === item.id ? { ...other, ...item } : other)) } : current,
    );
  }, []);

  return (
    <PageLayout header={<PageHeader icon={<Star size={18} />} title={t('title')} />}>
      {entries === null ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState className="py-20" icon={<Star size={24} />} title={t('empty')} />
      ) : (
        <ul className="space-y-1">
          {sorted.map(entry => {
            const { item, owner } = entry;
            return (
              <li
                key={item.id}
                tabIndex={0}
                onClick={() => open(entry)}
                onKeyDown={event => {
                  if (event.target === event.currentTarget && event.key === 'Enter') open(entry);
                }}
                className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
              >
                <FileTile kind={item.kind} mime={item.mime} name={item.name} thumbnail={item.hasThumbnail ? urls.thumbnail(item) : null} />
                <div className="min-w-0 flex-1">
                  <FileName name={item.name} folder={item.kind === 'folder'} className="text-[15px] font-semibold text-ink" />
                  <p className="flex items-center gap-1.5 truncate text-sm text-ink-muted">
                    {owner ? (
                      <>
                        <Avatar person={owner} size="xs" />
                        {tFiles('sharedBy', { name: owner.username })}
                      </>
                    ) : (
                      entry.location || tFiles('title')
                    )}
                  </p>
                </div>
                <span className="hidden text-sm text-ink-muted tabular-nums sm:block">
                  {item.kind === 'folder' ? tFiles('itemCount', { count: item.childCount ?? 0 }) : formatBytes(item.size, locale)}
                </span>
                <IconButton
                  label={t('remove', { name: item.name })}
                  icon={<Star size={18} fill="currentColor" />}
                  onClick={event => {
                    event.stopPropagation();
                    void unstar(entry);
                  }}
                  className="text-star hover:text-star"
                />
                <ActionMenu
                  label={tFiles('actions.label', { name: item.name })}
                  triggerClassName="size-9"
                  actions={[
                    {
                      label: item.kind === 'folder' ? tFiles('actions.open') : tFiles('actions.preview'),
                      icon: item.kind === 'folder' ? FolderOpen : Eye,
                      onSelect: () => open(entry),
                    },
                    {
                      label: tFiles('actions.download'),
                      icon: Download,
                      onSelect: () => download(item.kind === 'file' ? urls.content(item.id, true) : urls.zip([item.id], item.name)),
                    },
                    { label: tFiles('actions.unfavorite'), icon: StarOff, onSelect: () => void unstar(entry) },
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
          onSaved={saved}
          mayEdit={item => mine.has(item.id)}
        />
      ) : null}
    </PageLayout>
  );
}
