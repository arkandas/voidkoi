'use client';

import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button, Modal, Spinner } from '@/components/ui';
import { api } from '@/modules/files/lib/api';
import type { Crumb, ItemDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { useApiError } from '@/lib/use-api-error';

export interface MoveDialogProps {
  /** What is being moved; null when the dialog is closed. */
  items: ItemDto[] | null;
  onClose(): void;
  onMoved(targetId: number | null): void;
}

/** Pick a folder by walking down from the top of My files. */
export function MoveDialog({ items, onClose, onMoved }: MoveDialogProps) {
  const t = useTranslations('files.move');
  const tFiles = useTranslations('files.browser');
  const tCommon = useTranslations('common');
  const apiError = useApiError();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<ItemDto[] | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const moving = new Set(items?.map(item => item.id) ?? []);
  const open = items !== null;
  const [wasOpen, setWasOpen] = useState(false);
  const [shown, setShown] = useState<{ open: boolean; folderId: number | null } | null>(null);

  // It opens where the items are. Only when it opens: afterwards the person is browsing.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFolderId(items?.[0]?.parentId ?? null);
  }

  // Another folder: its list is on its way.
  if (!shown || shown.open !== open || shown.folderId !== folderId) {
    setShown({ open, folderId });
    if (open) {
      setFolders(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .folder(folderId)
      .then(listing => {
        if (cancelled) return;
        setFolders(listing.items.filter(item => item.kind === 'folder').sort((a, b) => a.name.localeCompare(b.name)));
        setCrumbs(listing.crumbs);
      })
      .catch(caught => {
        if (!cancelled) setError(apiError(caught, 'loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, folderId, apiError]);

  const alreadyThere = items?.every(item => item.parentId === folderId) ?? false;

  const move = async (): Promise<void> => {
    if (!items) return;
    setBusy(true);
    setError(null);
    try {
      await api.move(items.map(item => item.id), folderId);
      onMoved(folderId);
      onClose();
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const title = items?.length === 1 ? t('titleOne', { name: items[0]!.name }) : t('titleMany', { count: items?.length ?? 0 });

  return (
    <Modal open={open} label={title} title={title} onClose={busy ? undefined : onClose} dismissible={!busy} padded={false}>
      <nav aria-label={t('path')} className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-3 text-sm sm:px-6">
        <button
          type="button"
          onClick={() => setFolderId(null)}
          className={cn('rounded-md px-1.5 py-0.5 font-medium hover:bg-muted', folderId === null ? 'text-ink' : 'text-ink-muted')}
        >
          {tFiles('title')}
        </button>
        {crumbs.map(crumb => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setFolderId(crumb.id)}
              className={cn('max-w-40 truncate rounded-md px-1.5 py-0.5 font-medium hover:bg-muted', crumb.id === folderId ? 'text-ink' : 'text-ink-muted')}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="themed-scroll h-72 overflow-y-auto p-2">
        {folders === null && !error ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : folders?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-muted">
            <FolderOpen size={28} className="text-ink-faint" aria-hidden="true" />
            {t('noFolders')}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {folders?.map(folder => {
              const blocked = moving.has(folder.id);
              return (
                <li key={folder.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setFolderId(folder.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Folder size={18} className="shrink-0 text-accent" fill="currentColor" fillOpacity={0.18} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{folder.name}</span>
                    {blocked ? null : <ChevronRight size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? <p role="alert" className="px-4 pb-2 text-sm font-medium text-danger sm:px-6">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="outline" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
          {tCommon('cancel')}
        </Button>
        <Button onClick={() => void move()} disabled={busy || alreadyThere || folders === null} className="w-full sm:w-auto">
          {t('here')}
        </Button>
      </div>
    </Modal>
  );
}
