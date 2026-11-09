'use client';

import { ArrowLeft, Folder, FolderPlus, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { AppSwitcher } from '@/components/shell/switcher';
import { IconButton, Spinner, useToast } from '@/components/ui';
import { useApiError } from '@/lib/use-api-error';
import { notesApi } from '@/modules/notes/lib/api';
import type { NoteDto } from '@/modules/notes/lib/api-types';

import { NoteRow, NoteTree, type TreeProps } from './note-list';
import { TrashList } from './trash-list';

export interface SidebarProps extends Omit<TreeProps, 'collapsed' | 'onToggleFolder'> {
  loaded: boolean;
  onCreateFolder(name: string): Promise<boolean>;
  /** A note back from the trash. */
  onRestored(note: NoteDto): void;
  /** On a phone, where the list is a drawer. */
  onClose(): void;
}

/** Notes' own column: the folders and notes, a search through them, and the trash. */
export function NotesSidebar({ loaded, onCreateFolder, onRestored, onClose, ...tree }: SidebarProps) {
  const t = useTranslations('notes');
  const toast = useToast();
  const apiError = useApiError();
  const [query, setQuery] = useState('');
  const [naming, setNaming] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [trash, setTrash] = useState<NoteDto[] | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const creating = useRef(false);

  const { notes, folders } = tree;
  const needle = query.trim();
  const results = useMemo(() => {
    if (!needle) return null;
    const lower = needle.toLowerCase();
    return notes
      .filter(note => note.title.toLowerCase().includes(lower) || note.content.toLowerCase().includes(lower))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [notes, needle]);

  const toggleFolder = (name: string): void => {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /** On blur, which Enter brings about too. Escape drops it. */
  const createFolder = async (input: HTMLInputElement): Promise<void> => {
    const name = input.value.trim();
    setNaming(false);
    if (input.dataset.cancelled === 'true' || !name || creating.current) return;
    creating.current = true;
    try {
      await onCreateFolder(name);
    } finally {
      creating.current = false;
    }
  };

  const openTrash = async (): Promise<void> => {
    setShowTrash(true);
    setConfirmEmpty(false);
    setTrash(null);
    try {
      setTrash(await notesApi.trashList());
    } catch (error) {
      toast.show(apiError(error, 'loadFailed'), 'error');
      setTrash([]);
    }
  };

  const restore = async (note: NoteDto): Promise<void> => {
    try {
      const restored = await notesApi.restore(note.id);
      setTrash(current => current?.filter(entry => entry.id !== note.id) ?? null);
      onRestored(restored);
    } catch (error) {
      toast.show(apiError(error, 'restoreFailed'), 'error');
    }
  };

  const deleteForever = async (note: NoteDto): Promise<void> => {
    try {
      await notesApi.deleteForever(note.id);
      setTrash(current => current?.filter(entry => entry.id !== note.id) ?? null);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const emptyTrash = async (): Promise<void> => {
    try {
      await notesApi.emptyTrash();
      setTrash([]);
      setConfirmEmpty(false);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const rows = {
    selectedId: tree.selectedId,
    pinnedId: tree.pinnedId,
    canPin: tree.canPin,
    onSelect: tree.onSelect,
    onPin: tree.onPin,
    formatDate: tree.formatDate,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        On a wide screen the mark and name sit where every app's sidebar has them. On a
        tablet this column is the first thing on the left, so the app switcher takes the
        mark's place, where the other apps have theirs.
      */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-2 pl-4 md:pl-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <AppSwitcher className="max-md:hidden" />
          <AppIcon app="notes" size={28} className="rounded-lg md:max-lg:hidden" />
          <span className="truncate text-lg font-bold tracking-tight text-ink">{t('app.name')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="sm"
            label={t('list.newFolder')}
            icon={<FolderPlus size={17} />}
            onClick={() => {
              setShowTrash(false);
              setNaming(true);
            }}
            className="size-9"
          />
          <IconButton size="sm" label={t('list.newNote')} icon={<Plus size={19} />} onClick={() => tree.onNewNote('')} className="size-9" />
          <IconButton size="sm" label={t('list.close')} icon={<X size={19} />} onClick={onClose} className="size-9 md:hidden" />
        </div>
      </div>

      {showTrash ? (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowTrash(false)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink"
          >
            <ArrowLeft size={15} />
            {t('trash.back')}
          </button>
          {trash && trash.length > 0 ? (
            confirmEmpty ? (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void emptyTrash()}
                  className="rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-danger/90"
                >
                  {t('trash.deleteCount', { count: trash.length })}
                </button>
                <button type="button" onClick={() => setConfirmEmpty(false)} className="text-[11px] font-medium text-ink-muted hover:text-ink">
                  {t('trash.cancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEmpty(true)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-danger transition-colors hover:bg-danger-soft"
              >
                {t('trash.empty')}
              </button>
            )
          ) : null}
        </div>
      ) : (
        <div className="shrink-0 px-3 pb-2">
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder={t('list.search')}
              aria-label={t('list.search')}
              className="h-10 w-full rounded-lg border border-line bg-raised pr-8 pl-9 text-base text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/25 md:h-9 md:text-sm dark:bg-card [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('list.clearSearch')}
                title={t('list.clearSearch')}
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-faint hover:text-ink-muted"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3">
        {showTrash ? (
          <TrashList notes={trash} formatDate={tree.formatDate} onRestore={note => void restore(note)} onDelete={note => void deleteForever(note)} />
        ) : (
          <>
            {naming ? (
              <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
                <Folder size={16} className="shrink-0 text-ink-muted" />
                <input
                  autoFocus
                  maxLength={80}
                  aria-label={t('list.newFolder')}
                  placeholder={t('list.folderName')}
                  onKeyDown={event => {
                    if (event.key === 'Escape') event.currentTarget.dataset.cancelled = 'true';
                    if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                  }}
                  onBlur={event => void createFolder(event.currentTarget)}
                  className="h-9 w-full min-w-0 flex-1 rounded-md border border-accent bg-raised px-2 text-base font-semibold text-ink outline-hidden md:text-[15px] dark:bg-card"
                />
              </div>
            ) : null}

            {results ? (
              <div className="flex flex-col gap-0.5 px-2">
                <p className="px-1 pt-2 pb-1 text-xs font-medium text-ink-muted">{t('list.matches', { count: results.length, query: needle })}</p>
                {results.map(note => (
                  <NoteRow key={note.id} note={note} query={needle} {...rows} />
                ))}
                {results.length === 0 ? <p className="px-1 py-4 text-center text-xs text-ink-faint">{t('list.nothingFound')}</p> : null}
              </div>
            ) : !loaded ? (
              <div className="flex justify-center py-8">
                <Spinner size={18} />
              </div>
            ) : (
              <>
                {notes.length === 0 && folders.length === 0 ? <p className="mt-4 text-center text-xs text-ink-faint">{t('list.empty')}</p> : null}
                <NoteTree
                  {...tree}
                  collapsed={collapsed}
                  onToggleFolder={toggleFolder}
                  onFolderRename={(folder, name) => {
                    setCollapsed(current => {
                      if (!current.has(folder.name)) return current;
                      const next = new Set(current);
                      next.delete(folder.name);
                      next.add(name);
                      return next;
                    });
                    tree.onFolderRename(folder, name);
                  }}
                />
              </>
            )}
          </>
        )}
      </div>

      {showTrash ? null : (
        <button
          type="button"
          onClick={() => void openTrash()}
          className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink lg:mb-3"
        >
          <Trash2 size={15} />
          {t('trash.title')}
        </button>
      )}
    </div>
  );
}
