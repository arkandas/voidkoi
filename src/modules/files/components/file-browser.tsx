'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Globe,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Search,
  Share2,
  Star,
  StarOff,
  Trash,
  Upload,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';

import { FavoriteMark } from '@/modules/files/components/favorite-mark';
import { FileTile, isPage, PlayBadge } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { carriesItems, DRAG_TYPE, draggedIds } from '@/modules/files/components/item-drag';
import { MoveDialog } from '@/modules/files/components/move-dialog';
import { useLendMove } from '@/modules/files/components/move-target';
import { NameDialog } from '@/modules/files/components/name-dialog';
import { ShareDialog } from '@/modules/files/components/share-dialog';
import { appSource, Viewer } from '@/modules/files/components/viewer';
import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { useUploads, useUploadTarget } from '@/modules/files/components/upload/upload-provider';
import { ActionMenu, Avatar, Button, EmptyState, IconButton, Segmented, Spinner, useToast, type MenuAction } from '@/components/ui';
import { api, download, urls } from '@/modules/files/lib/api';
import type { FolderListing, ItemDto, SearchResult } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { canThumbnail, fileKind } from '@/lib/file-types';
import { formatBytes, formatDate } from '@/lib/format';
import { sortItems, type SortDirection, type SortKey } from '@/modules/files/lib/sort';
import type { Target } from '@/modules/files/lib/upload/engine';
import { useApiError } from '@/lib/use-api-error';
import { useStoredState } from '@/lib/use-stored-state';

const VIEWS = ['list', 'grid'] as const;
const SORT_KEYS = ['name', 'size', 'modified'] as const;
const DIRECTIONS = ['asc', 'desc'] as const;


function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** How an item is shared, as small marks: an upload link, a link, and how many people. */
function SharingMarks({ item }: { item: ItemDto }) {
  const t = useTranslations('files.browser.sharing');
  if (!item.link && !item.people && !item.uploadLink) return null;
  return (
    <span className="flex items-center gap-2 text-ink-muted">
      {item.uploadLink ? (
        <span title={t('upload')} className="flex">
          <Upload size={15} aria-hidden="true" />
          <span className="sr-only">{t('upload')}</span>
        </span>
      ) : null}
      {item.link ? (
        <span title={item.link === 'public' ? t('public') : t('users')} className="flex">
          {item.link === 'public' ? <Globe size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
          <span className="sr-only">{item.link === 'public' ? t('public') : t('users')}</span>
        </span>
      ) : null}
      {item.people ? (
        <span title={t('people', { count: item.people })} className="flex items-center gap-1 text-xs font-semibold tabular-nums">
          <Users size={15} aria-hidden="true" />
          {item.people}
          <span className="sr-only">{t('people', { count: item.people })}</span>
        </span>
      ) : null}
    </span>
  );
}

export function FileBrowser({ folderId }: { folderId: number | null }) {
  const t = useTranslations('files.browser');
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const { manager, pick } = useUploads();

  const [listing, setListing] = useState<FolderListing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useStoredState('files-view', 'grid', VIEWS);
  const [sortKey, setSortKey] = useStoredState<SortKey>('files-sort', 'name', SORT_KEYS);
  const [sortDirection, setSortDirection] = useStoredState<SortDirection>('files-sort-direction', 'asc', DIRECTIONS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; item: ItemDto } | null>(null);
  const [moving, setMoving] = useState<ItemDto[] | null>(null);
  const [sharing, setSharing] = useState<ItemDto | null>(null);
  const [viewing, setViewing] = useState<{ items: ItemDto[]; index: number } | null>(null);
  const [dropOn, setDropOn] = useState<number | 'root' | null>(null);
  const [shownFolder, setShownFolder] = useState(folderId);

  // Another folder starts over: loading, nothing selected, no search.
  if (folderId !== shownFolder) {
    setShownFolder(folderId);
    setListing(null);
    setSelected(new Set());
    setQuery('');
  }

  const load = useCallback(async () => {
    try {
      setListing(await api.folder(folderId));
      setFailed(null);
    } catch (error) {
      setFailed(apiError(error, 'loadFailed'));
    }
  }, [folderId, apiError]);

  // The listing is set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    api.folder(folderId).then(
      found => {
        if (cancelled) return;
        setListing(found);
        setFailed(null);
      },
      (error: unknown) => {
        if (!cancelled) setFailed(apiError(error, 'loadFailed'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [folderId, apiError]);

  // A picture's thumbnail is made just after it arrives: look again a few times until it's there.
  const awaitThumbnail = useCallback((id: number) => {
    let attempt = 0;
    const look = (): void => {
      attempt += 1;
      api
        .item(id)
        .then(({ item }) => {
          if (item.hasThumbnail) {
            setListing(current => (current ? { ...current, items: current.items.map(other => (other.id === id ? { ...other, ...item } : other)) } : current));
          } else if (attempt < 4) {
            setTimeout(look, 1500 * 2 ** attempt);
          }
        })
        .catch(() => {});
    };
    setTimeout(look, 1500);
  }, []);

  // A file arriving in this folder joins the list where it belongs, and glows for a moment.
  useEffect(
    () =>
      manager.onUploaded(item => {
        if (item.parentId === folderId && canThumbnail(item.mime, item.name) && !item.hasThumbnail) awaitThumbnail(item.id);
        setListing(current => {
          if (!current) return current;
          if (item.parentId === folderId) {
            // A replaced file keeps its place, with its new size and date.
            if (current.items.some(existing => existing.id === item.id)) {
              return { ...current, items: current.items.map(existing => (existing.id === item.id ? { ...existing, ...item } : existing)) };
            }
            return { ...current, items: [...current.items, item] };
          }
          return {
            ...current,
            items: current.items.map(existing =>
              existing.id === item.parentId ? { ...existing, childCount: (existing.childCount ?? 0) + 1 } : existing,
            ),
          };
        });
        if (item.parentId === folderId) setFresh(current => new Set(current).add(item.id));
      }),
    [manager, folderId, awaitThumbnail],
  );

  useEffect(() => manager.onFolders(parentId => {
    if (parentId === folderId) void load();
  }), [manager, folderId, load]);

  const owner = listing?.role !== 'viewer';
  /** Your own folders live under My files; other people's under Shared with me. */
  const base = owner ? '/files' : '/files/shared-with-me';
  const pathname = usePathname();

  // Opened from the other address, like a My files link to a folder someone shared:
  // move to where it belongs, so the sidebar marks the right place.
  useEffect(() => {
    if (!listing || folderId === null) return;
    const home = `${base}/${folderId}`;
    if (pathname !== home) router.replace(home);
  }, [listing, folderId, base, pathname, router]);

  const folderName = listing?.folder?.name ?? t('title');
  const target = useMemo<Target | null>(
    () => (listing && listing.role === 'owner' ? { id: folderId, label: folderName } : null),
    [listing, folderId, folderName],
  );
  useUploadTarget(target);

  const sorted = useMemo(
    () => (listing ? sortItems(listing.items, { key: sortKey, direction: sortDirection }, locale) : []),
    [listing, sortKey, sortDirection, locale],
  );

  // Without a search, the folder shows again.
  if (!query.trim() && results !== null) setResults(null);

  useEffect(() => {
    const text = query.trim();
    if (!text) return;
    const timer = setTimeout(() => {
      api.search(text).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const shownItems = results ? results.map(result => result.item) : sorted;
  const selectedItems = sorted.filter(item => selected.has(item.id));

  /* --- actions ------------------------------------------------------------ */

  const open = (item: ItemDto, among: ItemDto[] = shownItems): void => {
    if (item.kind === 'folder') {
      router.push(`${base}/${item.id}`);
      return;
    }
    const files = among.filter(other => other.kind === 'file');
    setViewing({ items: files, index: Math.max(0, files.findIndex(other => other.id === item.id)) });
  };

  /** A text file edited in the viewer: its new size and date, here and in the viewer. */
  const saved = useCallback((item: ItemDto): void => {
    const swap = (list: ItemDto[]) => list.map(other => (other.id === item.id ? { ...other, ...item } : other));
    setListing(current => (current ? { ...current, items: swap(current.items) } : current));
    setViewing(current => (current ? { ...current, items: swap(current.items) } : current));
    awaitThumbnail(item.id);
  }, [awaitThumbnail]);

  const downloadItems = (items: ItemDto[]): void => {
    if (items.length === 1 && items[0]!.kind === 'file') download(urls.content(items[0]!.id, true));
    else download(urls.zip(items.map(item => item.id), items.length === 1 ? items[0]!.name : folderName));
  };

  const trash = async (items: ItemDto[]): Promise<void> => {
    const ids = items.map(item => item.id);
    try {
      await api.trash(ids);
      setListing(current => (current ? { ...current, items: current.items.filter(item => !ids.includes(item.id)) } : current));
      setResults(current => current?.filter(result => !ids.includes(result.item.id)) ?? null);
      setSelected(new Set());
      toast.show(items.length === 1 ? t('trashedOne', { name: items[0]!.name }) : t('trashedMany', { count: items.length }), 'info', {
        label: t('undo'),
        run: () => {
          void Promise.all(ids.map(id => api.restore(id)))
            .then(() => load())
            .catch(error => toast.show(apiError(error, 'restoreFailed'), 'error'));
        },
      });
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const moveInto = async (ids: number[], destination: number | null, name: string): Promise<void> => {
    const movable = ids.filter(id => id !== destination);
    if (movable.length === 0) return;
    try {
      await api.move(movable, destination);
      setSelected(new Set());
      toast.show(t('moved', { count: movable.length, folder: name }), 'success');
      await load();
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  /** Star or unstar at once, and put it back if the server says no. */
  const setFavorite = async (item: ItemDto, favorite: boolean): Promise<void> => {
    const mark = (value: boolean): void => {
      const swap = (other: ItemDto): ItemDto => (other.id === item.id ? { ...other, favorite: value } : other);
      setListing(current => (current ? { ...current, items: current.items.map(swap) } : current));
      setResults(current => current?.map(result => ({ ...result, item: swap(result.item) })) ?? null);
    };
    mark(favorite);
    try {
      await api.setFavorite(item.id, favorite);
    } catch (error) {
      mark(!favorite);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const actionsFor = (item: ItemDto): MenuAction[] => [
    {
      label: item.kind === 'folder' ? t('actions.open') : t('actions.preview'),
      icon: item.kind === 'folder' ? FolderOpen : Eye,
      onSelect: () => open(item),
    },
    { label: t('actions.download'), icon: Download, onSelect: () => downloadItems([item]) },
    {
      label: item.favorite ? t('actions.unfavorite') : t('actions.favorite'),
      icon: item.favorite ? StarOff : Star,
      onSelect: () => void setFavorite(item, !item.favorite),
    },
    { label: t('actions.share'), icon: Share2, onSelect: () => setSharing(item), hidden: !owner },
    { label: t('actions.rename'), icon: Pencil, onSelect: () => setNaming({ mode: 'rename', item }), hidden: !owner },
    { label: t('actions.move'), icon: FolderInput, onSelect: () => setMoving([item]), hidden: !owner },
    { label: t('actions.trash'), icon: Trash, onSelect: () => void trash([item]), danger: true, hidden: !owner },
  ];

  /* --- selection ---------------------------------------------------------- */

  const toggle = (id: number): void => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const selectRange = (id: number): void => {
    const ids = sorted.map(item => item.id);
    const from = ids.indexOf(anchor ?? id);
    const to = ids.indexOf(id);
    const [start, end] = from < to ? [from, to] : [to, from];
    setSelected(new Set(ids.slice(Math.max(0, start), end + 1)));
  };

  const onRowClick = (event: MouseEvent, item: ItemDto): void => {
    if (results) {
      open(item);
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(item.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggle(item.id);
    } else if (selected.size > 0) {
      toggle(item.id);
    } else {
      open(item);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && selected.size > 0) setSelected(new Set());
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !results) {
        event.preventDefault();
        setSelected(new Set(sorted.map(item => item.id)));
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && owner && selected.size > 0) {
        event.preventDefault();
        void trash(selectedItems);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* --- moving by dragging ---------------------------------------------------- */

  // My files in the sidebar takes items too, and moves them through here.
  useLendMove(owner && !results ? { folderId, move: (ids, parentId, name) => void moveInto(ids, parentId, name) } : null);

  const dragProps = (item: ItemDto) =>
    owner && !results
      ? {
          draggable: true,
          onDragStart: (event: DragEvent) => {
            const ids = selected.has(item.id) ? [...selected] : [item.id];
            event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
            event.dataTransfer.effectAllowed = 'move';
          },
        }
      : {};

  const dropProps = (id: number | null, name: string) =>
    owner && !results
      ? {
          onDragOver: (event: DragEvent) => {
            if (!carriesItems(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropOn(id ?? 'root');
          },
          onDragLeave: () => setDropOn(current => (current === (id ?? 'root') ? null : current)),
          onDrop: (event: DragEvent) => {
            if (!carriesItems(event)) return;
            event.preventDefault();
            setDropOn(null);
            const ids = draggedIds(event);
            if (ids && !(id !== null && ids.includes(id))) void moveInto(ids, id, name);
          },
        }
      : {};

  /* --- pieces --------------------------------------------------------------- */

  const thumb = (item: ItemDto) => (item.hasThumbnail ? urls.thumbnail(item) : null);
  const detail = (item: ItemDto) =>
    item.kind === 'folder' ? t('itemCount', { count: item.childCount ?? 0 }) : formatBytes(item.size, locale);

  const checkbox = (item: ItemDto) =>
    results ? null : (
      <input
        type="checkbox"
        checked={selected.has(item.id)}
        onChange={() => toggle(item.id)}
        onClick={event => {
          event.stopPropagation();
          if (event.shiftKey) {
            event.preventDefault();
            selectRange(item.id);
          }
        }}
        aria-label={t('select', { name: item.name })}
        className={cn(
          'size-[18px] shrink-0 cursor-pointer rounded transition-opacity',
          selected.size > 0 ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100',
        )}
      />
    );

  const menu = (item: ItemDto) => (
    <ActionMenu label={t('actions.label', { name: item.name })} actions={actionsFor(item)} triggerClassName="size-9">
      <MoreHorizontal size={18} aria-hidden="true" />
    </ActionMenu>
  );

  const sortButton = (key: SortKey, label: string, className?: string) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        else {
          setSortKey(key);
          setSortDirection(key === 'name' ? 'asc' : 'desc');
        }
      }}
      className={cn('flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:text-ink', sortKey === key && 'text-ink', className)}
      aria-label={t('sortBy', { column: label })}
    >
      {label}
      {sortKey === key ? sortDirection === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" /> : null}
    </button>
  );

  const listGrid = owner ? 'grid-cols-[1.5rem_minmax(0,1fr)_2.25rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_2.25rem] md:grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_8rem_2.25rem] lg:grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_8rem_5.5rem_2.25rem]'
    : 'grid-cols-[1.5rem_minmax(0,1fr)_2.25rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_2.25rem] md:grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_8rem_2.25rem]';

  const listView = (items: ItemDto[]) => (
    <div role="table" aria-label={folderName} className="text-sm">
      {results ? null : (
        <div role="row" className={cn('grid items-center gap-3 px-3 pb-1.5 text-xs font-semibold text-ink-muted', listGrid)}>
          <span role="columnheader">
            <input
              type="checkbox"
              aria-label={t('selectAll')}
              checked={items.length > 0 && selected.size === items.length}
              ref={element => {
                if (element) element.indeterminate = selected.size > 0 && selected.size < items.length;
              }}
              onChange={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map(item => item.id)))}
              className="size-[18px] cursor-pointer rounded"
            />
          </span>
          <span role="columnheader">{sortButton('name', t('columns.name'))}</span>
          <span role="columnheader" className="hidden sm:block">{sortButton('size', t('columns.size'))}</span>
          <span role="columnheader" className="hidden md:block">{sortButton('modified', t('columns.modified'))}</span>
          {owner ? <span role="columnheader" className="hidden lg:block">{t('columns.sharing')}</span> : null}
          <span role="columnheader" className="sr-only">{t('columns.actions')}</span>
        </div>
      )}
      <div role="rowgroup" className="space-y-0.5">
        {items.map(item => {
          const isSelected = selected.has(item.id);
          const location = results?.find(result => result.item.id === item.id)?.location;
          return (
            <div
              key={item.id}
              role="row"
              tabIndex={0}
              aria-selected={isSelected}
              onClick={event => onRowClick(event, item)}
              onKeyDown={event => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter') open(item);
                if (event.key === ' ') {
                  event.preventDefault();
                  toggle(item.id);
                }
              }}
              {...dragProps(item)}
              {...(item.kind === 'folder' ? dropProps(item.id, item.name) : {})}
              className={cn(
                'group grid min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 transition-colors select-none',
                'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
                listGrid,
                isSelected ? 'bg-accent-soft' : 'hover:bg-muted',
                dropOn === item.id && 'drop-target',
                fresh.has(item.id) && 'just-added',
              )}
            >
              <span role="cell" className="flex items-center">{checkbox(item)}</span>
              <span role="cell" className="flex min-w-0 items-center gap-3">
                <FileTile kind={item.kind} mime={item.mime} name={item.name} thumbnail={thumb(item)} />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileName name={item.name} folder={item.kind === 'folder'} className="font-semibold text-ink" />
                    <FavoriteMark item={item} />
                  </span>
                  <span className="block truncate text-xs text-ink-muted sm:hidden">
                    {detail(item)} · {formatDate(item.updatedAt, locale)}
                  </span>
                  {location !== undefined ? (
                    <span className="hidden truncate text-xs text-ink-muted sm:block">{location || t('title')}</span>
                  ) : null}
                </span>
              </span>
              <span role="cell" className="hidden text-ink-muted tabular-nums sm:block">{detail(item)}</span>
              <span role="cell" className="hidden text-ink-muted tabular-nums md:block">{formatDate(item.updatedAt, locale)}</span>
              {owner ? <span role="cell" className="hidden lg:block"><SharingMarks item={item} /></span> : null}
              <span role="cell" className="flex justify-end">{menu(item)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const gridView = (items: ItemDto[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
      {items.map(item => {
        const isSelected = selected.has(item.id);
        const picture = thumb(item);
        return (
          <li
            key={item.id}
            tabIndex={0}
            onClick={event => onRowClick(event, item)}
            onKeyDown={event => {
              if (event.target === event.currentTarget && event.key === 'Enter') open(item);
            }}
            {...dragProps(item)}
            {...(item.kind === 'folder' ? dropProps(item.id, item.name) : {})}
            className={cn(
              'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-colors select-none',
              'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
              isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-strong',
              dropOn === item.id && 'drop-target',
              fresh.has(item.id) && 'just-added',
            )}
          >
            <div
              className={cn(
                'relative flex aspect-[4/3] items-center justify-center overflow-hidden',
                item.kind === 'folder' ? 'bg-accent-soft text-accent' : 'bg-muted text-ink-muted',
              )}
            >
              {picture ? (
                <>
                  <img
                    src={picture}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className={cn('size-full object-cover', isPage(fileKind(item.mime, item.name)) && 'object-left-top')}
                  />
                  {fileKind(item.mime, item.name) === 'video' ? <PlayBadge large /> : null}
                </>
              ) : (
                <FileTile kind={item.kind} mime={item.mime} name={item.name} className="size-14 rounded-2xl bg-transparent [&_svg]:size-9" />
              )}
            </div>
            <div className="flex items-start gap-1 p-2.5 pr-1">
              <div className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileName name={item.name} folder={item.kind === 'folder'} className="text-sm font-semibold text-ink" />
                  <FavoriteMark item={item} />
                </span>
                <p className="truncate text-xs text-ink-muted tabular-nums">{detail(item)}</p>
              </div>
              {menu(item)}
            </div>
            {results ? null : (
              <span
                className={cn(
                  'absolute top-2 left-2 flex items-center rounded-md bg-card/90 p-1 shadow-xs transition-opacity',
                  selected.size > 0 ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
                )}
              >
                {checkbox(item)}
              </span>
            )}
            {owner && (item.link || item.people || item.uploadLink) ? (
              <span className="absolute top-2 right-2 rounded-full bg-card/90 px-2 py-1 shadow-xs">
                <SharingMarks item={item} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  /* --- the page ------------------------------------------------------------- */

  const crumbs = listing?.crumbs ?? [];
  const homeHref = base;
  const homeLabel = owner ? t('title') : t('sharedWithMe');

  let body: ReactNode;
  if (failed) {
    body = (
      <EmptyState
        icon={<FolderOpen size={24} />}
        title={failed}
        action={<Button variant="outline" onClick={() => void load()}>{t('retry')}</Button>}
      />
    );
  } else if (!listing) {
    body = (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  } else if (results) {
    body = results.length === 0 ? (
      <EmptyState icon={<Search size={24} />} title={t('noResults', { query: query.trim() })} />
    ) : (
      listView(results.map(result => result.item))
    );
  } else if (sorted.length === 0) {
    body = owner ? (
      <EmptyState
        className="py-20"
        icon={<Upload size={24} />}
        title={t('empty.title')}
        action={
          <Button icon={<Upload size={16} />} onClick={() => pick('files')}>
            {t('upload')}
          </Button>
        }
      />
    ) : (
      <EmptyState className="py-20" icon={<FolderOpen size={24} />} title={t('emptyShared')} />
    );
  } else {
    body = view === 'grid' ? gridView(sorted) : listView(sorted);
  }

  const headerActions = owner ? (
    <>
      <Button variant="outline" icon={<FolderPlus size={16} />} onClick={() => setNaming({ mode: 'create' })} className="hidden sm:inline-flex">
        {t('newFolder')}
      </Button>
      <IconButton variant="outline" label={t('newFolder')} icon={<FolderPlus size={18} />} onClick={() => setNaming({ mode: 'create' })} className="sm:hidden" />
      <div className="flex">
        <Button icon={<Upload size={16} />} onClick={() => pick('files')} className="rounded-r-none">
          {t('upload')}
        </Button>
        <ActionMenu
          label={t('uploadMore')}
          triggerClassName="h-10 w-9 rounded-l-none border-l border-accent-ink/20 bg-accent text-accent-ink hover:bg-accent-hover hover:text-accent-ink"
          actions={[{ label: t('uploadFolder'), icon: FolderUp, onSelect: () => pick('folder') }]}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </ActionMenu>
      </div>
    </>
  ) : listing && listing.folder ? (
    <Button variant="outline" icon={<Download size={16} />} onClick={() => downloadItems([listing.folder!])}>
      {t('downloadAll')}
    </Button>
  ) : null;

  return (
    <PageLayout
      header={
        <PageHeader
          icon={<FolderOpen size={18} />}
          title={folderName}
          subtitle={
            listing?.owner ? (
              <span className="flex items-center gap-1.5">
                <Avatar person={listing.owner} size="xs" />
                {t('sharedBy', { name: listing.owner.username })}
              </span>
            ) : undefined
          }
          action={headerActions}
        />
      }
    >
      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-2">
        {selected.size > 0 && !results ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-xl bg-accent-soft py-1 pr-1 pl-3">
            <span className="mr-2 text-sm font-semibold text-ink">{t('selected', { count: selected.size })}</span>
            <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={() => downloadItems(selectedItems)}>
              {t('actions.download')}
            </Button>
            {owner ? (
              <>
                <Button size="sm" variant="ghost" icon={<FolderInput size={15} />} onClick={() => setMoving(selectedItems)}>
                  {t('actions.move')}
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash size={15} />} onClick={() => void trash(selectedItems)} className="text-danger hover:bg-danger-soft">
                  {t('actions.trash')}
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => setSelected(new Set())} className="ml-auto">
              {t('clearSelection')}
            </Button>
          </div>
        ) : (
          crumbs.length === 0 ? (
            <div className={cn('flex-1', searching && 'hidden sm:block')} />
          ) : (
            <nav aria-label={t('path')} className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm', searching && 'hidden sm:flex')}>
              <Link
                href={homeHref}
                {...dropProps(null, t('title'))}
                className={cn('rounded-lg px-2 py-1 font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink', dropOn === 'root' && 'drop-target')}
              >
                {homeLabel}
              </Link>
              {crumbs.slice(0, -1).map(crumb => (
                <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
                  <Link
                    href={`${base}/${crumb.id}`}
                    {...dropProps(crumb.id, crumb.name)}
                    className={cn(
                      'max-w-48 truncate rounded-lg px-2 py-1 font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink',
                      dropOn === crumb.id && 'drop-target',
                    )}
                  >
                    {crumb.name}
                  </Link>
                </span>
              ))}
            </nav>
          )
        )}

        {owner ? (
          <div className={cn('relative', searching ? 'flex-1 sm:w-64 sm:flex-none' : 'hidden w-64 sm:block')}>
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  setQuery('');
                  setSearching(false);
                }
              }}
              placeholder={t('search')}
              aria-label={t('search')}
              className="h-9 w-full rounded-lg border border-line bg-raised pr-3 pl-9 text-base text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm dark:bg-card"
            />
          </div>
        ) : null}
        {owner && !searching ? (
          <Button size="sm" variant="ghost" onClick={() => setSearching(true)} aria-label={t('search')} className="sm:hidden">
            <Search size={16} />
          </Button>
        ) : null}
        {searching ? (
          <Button size="sm" variant="ghost" onClick={() => { setSearching(false); setQuery(''); }} className="sm:hidden">
            {t('cancelSearch')}
          </Button>
        ) : null}

        {!results ? (
          <Segmented
            ariaLabel={t('view')}
            iconOnly
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('viewList'), icon: List },
              { value: 'grid', label: t('viewGrid'), icon: LayoutGrid },
            ]}
          />
        ) : null}
      </div>

      {body}

      <NameDialog
        open={naming !== null}
        title={naming?.mode === 'rename' ? t('renameTitle') : t('newFolder')}
        label={t('name')}
        submitLabel={naming?.mode === 'rename' ? t('actions.rename') : t('create')}
        initial={naming?.mode === 'rename' ? naming.item.name : ''}
        isFile={naming?.mode === 'rename' && naming.item.kind === 'file'}
        onClose={() => setNaming(null)}
        onSubmit={async name => {
          if (naming?.mode === 'rename') {
            const renamed = await api.rename(naming.item.id, name);
            setListing(current => (current ? { ...current, items: current.items.map(item => (item.id === renamed.id ? renamed : item)) } : current));
          } else {
            const folder = await api.createFolder(folderId, name);
            setListing(current => (current ? { ...current, items: [...current.items, folder] } : current));
            setFresh(current => new Set(current).add(folder.id));
          }
        }}
      />
      <MoveDialog items={moving} onClose={() => setMoving(null)} onMoved={() => { setSelected(new Set()); void load(); }} />
      <ShareDialog item={sharing} onClose={() => setSharing(null)} onChanged={() => void load()} />
      {viewing ? (
        <Viewer
          items={viewing.items}
          index={viewing.index}
          source={appSource}
          onIndex={index => setViewing(current => (current ? { ...current, index } : current))}
          onClose={() => setViewing(null)}
          onShare={owner ? item => setSharing(item) : undefined}
          onSaved={owner ? saved : undefined}
        />
      ) : null}
    </PageLayout>
  );
}
