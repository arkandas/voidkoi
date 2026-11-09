'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  History,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Settings2,
  Share2,
  Trash,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { ActionMenu, useToast, type MenuAction } from '@/components/ui';
import { api, urls } from '@/modules/wiki/lib/api';
import type { TreeNodeDto } from '@/modules/wiki/lib/api-types';
import { cn } from '@/lib/cn';
import { ancestorIds, dropTarget, nest, nodeAt, type DropPlace, type TreeItem } from '@/modules/wiki/lib/tree-view';
import { useApiError } from '@/lib/use-api-error';

import { useWiki } from './wiki-provider';

const OPEN_KEY = 'wiki-tree-open';
const OPEN_EVENT = 'wiki-tree-open-change';

/* Which folders are open, kept in this browser ----------------------------- */

function subscribe(callback: () => void): () => void {
  window.addEventListener(OPEN_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(OPEN_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readOpen(): string {
  try {
    return localStorage.getItem(OPEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function useOpenFolders(): [Set<number>, (id: number, open: boolean) => void] {
  const raw = useSyncExternalStore(subscribe, readOpen, () => '');
  const open = useMemo(() => new Set(raw.split(',').filter(Boolean).map(Number)), [raw]);
  const set = useCallback((id: number, value: boolean) => {
    const next = new Set(readOpen().split(',').filter(Boolean).map(Number));
    if (value) next.add(id);
    else next.delete(id);
    try {
      localStorage.setItem(OPEN_KEY, [...next].join(','));
    } catch {}
    window.dispatchEvent(new Event(OPEN_EVENT));
  }, []);
  return [open, set];
}

/** The node an address shows: a page or folder, its editor or its history. */
function currentNode(tree: TreeNodeDto[], pathname: string, homePageId: number | null): number | null {
  const tool = /^\/wiki\/(?:edit|history)\/(\d+)/.exec(pathname);
  if (tool) return Number(tool[1]);
  if (pathname === '/wiki') return homePageId;
  if (!pathname.startsWith('/wiki/')) return null;
  return nodeAt(tree, pathname.slice('/wiki'.length))?.id ?? null;
}

/* The tree ------------------------------------------------------------------ */

interface Drop {
  over: number;
  place: DropPlace;
}

/** Folders and pages, the way they are ordered. Editors drag them around and act on them from their menus. */
export function PageTree({ onNavigate }: { onNavigate?(): void }) {
  const t = useTranslations('wiki.tree');
  const { tree, canEdit, homePageId, refresh } = useWiki();
  const pathname = usePathname();
  const toast = useToast();
  const apiError = useApiError();
  const [open, setOpen] = useOpenFolders();
  const [dragging, setDragging] = useState<number | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  const current = currentNode(tree, pathname, homePageId);
  // The folders around the page on show are open, whatever was saved, and so is the folder on show.
  const around = useMemo(() => {
    if (current === null) return new Set<number>();
    const shown = tree.find(node => node.id === current);
    return new Set([...ancestorIds(tree, current), ...(shown?.kind === 'folder' ? [current] : [])]);
  }, [tree, current]);
  const items = useMemo(() => nest(tree), [tree]);
  const isOpen = useCallback((id: number) => open.has(id) || around.has(id), [open, around]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
  );

  const onDragStart = (event: DragStartEvent): void => {
    setDragging(Number(event.active.id));
    setDrop(null);
  };

  const onDragMove = (event: DragMoveEvent): void => {
    const { over, activatorEvent, delta } = event;
    if (!over) return setDrop(null);
    const overId = Number(over.id);
    const node = tree.find(each => each.id === overId);
    const start = activatorEvent as PointerEvent | TouchEvent;
    const startY = 'touches' in start ? (start.touches[0]?.clientY ?? 0) : start.clientY;
    const fraction = (startY + delta.y - over.rect.top) / Math.max(1, over.rect.height);
    let place: DropPlace;
    if (node?.kind === 'folder') place = fraction < 0.28 ? 'before' : fraction > 0.72 ? 'after' : 'inside';
    else place = fraction < 0.5 ? 'before' : 'after';
    const id = Number(event.active.id);
    setDrop(dropTarget(tree, id, overId, place) ? { over: overId, place } : null);
  };

  const onDragEnd = async (event: DragEndEvent): Promise<void> => {
    const id = Number(event.active.id);
    const landing = drop;
    setDragging(null);
    setDrop(null);
    if (!landing) return;
    const target = dropTarget(tree, id, landing.over, landing.place);
    if (!target) return;
    if (landing.place === 'inside') setOpen(landing.over, true);
    try {
      await api.moveNode(id, target.parentId, target.position);
      refresh();
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  if (items.length === 0) return null;

  const list = (
    <ul data-page-tree aria-label={t('label')} className="flex flex-col gap-0.5">
      {items.map(item => (
        <Row
          key={item.id}
          item={item}
          current={current}
          isOpen={isOpen}
          setOpen={setOpen}
          canEdit={canEdit}
          drop={drop}
          dragging={dragging}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );

  if (!canEdit) return list;

  const moving = dragging === null ? null : tree.find(node => node.id === dragging);
  return (
    <DndContext
      // A fixed id, so its accessibility ids are the same on the server and in the browser.
      id="page-tree"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={event => void onDragEnd(event)}
      onDragCancel={() => {
        setDragging(null);
        setDrop(null);
      }}
    >
      {list}
      <DragOverlay dropAnimation={null}>
        {moving ? (
          <div className="flex max-w-60 items-center gap-2 rounded-md border border-line-strong bg-raised px-3 py-1.5 text-sm font-medium text-ink shadow-lg">
            {moving.kind === 'folder' ? <Folder size={15} className="shrink-0 text-ink-muted" /> : <FileText size={15} className="shrink-0 text-ink-muted" />}
            <span className="truncate">{moving.title || t('untitled')}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RowProps {
  item: TreeItem;
  current: number | null;
  isOpen(id: number): boolean;
  setOpen(id: number, open: boolean): void;
  canEdit: boolean;
  drop: Drop | null;
  dragging: number | null;
  onNavigate?(): void;
}

function Row({ item, current, isOpen, setOpen, canEdit, drop, dragging, onNavigate }: RowProps) {
  const t = useTranslations('wiki.tree');
  const folder = item.kind === 'folder';
  const expanded = folder && isOpen(item.id);
  const selected = item.id === current;
  const dropHere = drop?.over === item.id ? drop.place : null;

  const { setNodeRef: setDropRef } = useDroppable({ id: item.id, disabled: !canEdit });
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({ id: item.id, disabled: !canEdit });

  return (
    <li className="relative">
      <div
        ref={node => {
          setDropRef(node);
          setDragRef(node);
        }}
        {...(canEdit ? listeners : {})}
        {...(canEdit ? attributes : {})}
        role={undefined}
        tabIndex={undefined}
        style={{ paddingLeft: `${item.depth * 14 + 4}px` }}
        className={cn(
          'group relative flex min-h-9 items-center gap-0.5 rounded-lg pr-1 transition-colors',
          selected ? 'bg-card shadow-xs ring-1 ring-line' : 'hover:bg-card/60',
          dragging === item.id && 'opacity-40',
          dropHere === 'inside' && 'drop-target',
        )}
      >
        {dropHere === 'before' || dropHere === 'after' ? (
          <span
            aria-hidden="true"
            className={cn('pointer-events-none absolute right-1 left-2 h-0.5 rounded-full bg-accent', dropHere === 'before' ? '-top-px' : '-bottom-px')}
          />
        ) : null}
        {folder ? (
          <button
            type="button"
            onClick={() => setOpen(item.id, !expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? t('collapse', { title: item.title }) : t('expand', { title: item.title })}
            className="flex size-6 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ChevronRight size={15} aria-hidden="true" className={cn('transition-transform duration-150', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span aria-hidden="true" className="w-6 shrink-0" />
        )}
        {folder ? (
          expanded ? (
            <FolderOpen size={16} aria-hidden="true" className="mr-1.5 shrink-0 text-accent" />
          ) : (
            <Folder size={16} aria-hidden="true" className="mr-1.5 shrink-0 text-accent" />
          )
        ) : null}
        <Link
          href={urls.page(item.path)}
          onClick={() => {
            if (folder) setOpen(item.id, true);
            onNavigate?.();
          }}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'min-w-0 flex-1 truncate rounded-md py-1.5 pr-1 pl-0.5 text-sm leading-snug focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50',
            selected ? 'font-semibold text-ink' : folder ? 'font-semibold text-ink' : 'font-medium text-ink-muted hover:text-ink',
            item.unpublished && 'italic',
          )}
        >
          {item.title || t('untitled')}
        </Link>
        <Marks item={item} canEdit={canEdit} />
        {canEdit ? <RowMenu item={item} /> : null}
      </div>
      {expanded && item.children.length > 0 ? (
        <ul className="relative mt-0.5 flex flex-col gap-0.5">
          {/* A line down the folder's contents, under its chevron. */}
          <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-px bg-line" style={{ left: `${item.depth * 14 + 16}px` }} />
          {item.children.map(child => (
            <Row
              key={child.id}
              item={child}
              current={current}
              isOpen={isOpen}
              setOpen={setOpen}
              canEdit={canEdit}
              drop={drop}
              dragging={dragging}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** What is special about a row: locked, public, a draft. */
function Marks({ item, canEdit }: { item: TreeItem; canEdit: boolean }) {
  const t = useTranslations('wiki.tree');
  const marks: ReactNode[] = [];
  if (item.locked) {
    marks.push(<KeyRound key="locked" size={13} aria-label={t('locked')} className="text-ink-faint" />);
  }
  if (canEdit) {
    if (item.unpublished) {
      marks.push(
        <span key="draft" className="text-[11.5px] font-medium text-ink-faint">
          {t('draft')}
        </span>,
      );
    } else if (item.draft) {
      marks.push(<span key="changes" role="img" aria-label={t('changes')} title={t('changes')} className="size-1.5 rounded-full bg-accent" />);
    }
    if (item.visibility === 'public') marks.push(<Globe key="public" size={13} aria-label={t('public')} className="text-ink-faint" />);
    else if (item.visibility === 'password') marks.push(<KeyRound key="password" size={13} aria-label={t('password')} className="text-ink-faint" />);
    else if (item.visibility === 'private') marks.push(<Lock key="private" size={13} aria-label={t('private')} className="text-ink-faint" />);
  }
  if (marks.length === 0) return null;
  return <span className="flex shrink-0 items-center gap-1.5 pr-1 group-hover:hidden group-focus-within:hidden group-has-[[aria-haspopup=menu][aria-expanded=true]]:hidden">{marks}</span>;
}

function RowMenu({ item }: { item: TreeItem }) {
  const t = useTranslations('wiki.tree');
  const router = useRouter();
  const { open } = useWiki();
  const folder = item.kind === 'folder';
  const actions: MenuAction[] = folder
    ? [
        { label: t('newPage'), icon: FilePlus2, onSelect: () => open({ kind: 'create', nodeKind: 'page', parentId: item.id }) },
        { label: t('newFolder'), icon: FolderPlus, onSelect: () => open({ kind: 'create', nodeKind: 'folder', parentId: item.id }) },
        { label: t('share'), icon: Share2, onSelect: () => open({ kind: 'share', id: item.id }) },
        { label: t('settings'), icon: Settings2, onSelect: () => open({ kind: 'settings', id: item.id }) },
        { label: t('delete'), icon: Trash, danger: true, onSelect: () => open({ kind: 'delete', id: item.id }) },
      ]
    : [
        { label: t('edit'), icon: Pencil, onSelect: () => router.push(urls.edit(item.id)) },
        { label: t('share'), icon: Share2, onSelect: () => open({ kind: 'share', id: item.id }) },
        { label: t('settings'), icon: Settings2, onSelect: () => open({ kind: 'settings', id: item.id }) },
        { label: t('history'), icon: History, onSelect: () => router.push(urls.history(item.id)), hidden: item.unpublished },
        { label: t('delete'), icon: Trash, danger: true, onSelect: () => open({ kind: 'delete', id: item.id }) },
      ];
  return (
    <span
      className="hidden shrink-0 group-focus-within:flex group-hover:flex has-[[aria-haspopup=menu][aria-expanded=true]]:flex [@media(hover:none)]:flex"
      // A press on the menu shouldn't start a drag.
      onPointerDown={event => event.stopPropagation()}
    >
      <ActionMenu label={t('actions', { title: item.title || t('untitled') })} actions={actions} triggerClassName="size-7">
        <MoreHorizontal size={16} aria-hidden="true" />
      </ActionMenu>
    </span>
  );
}

/** Opens the folders around the page on show once, so it is in view when the page loads. */
export function useRevealCurrent(): void {
  const { tree, homePageId } = useWiki();
  const pathname = usePathname();
  useEffect(() => {
    const id = currentNode(tree, pathname, homePageId);
    if (id === null) return;
    const row = document.querySelector<HTMLElement>('[data-page-tree] [aria-current="page"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [tree, pathname, homePageId]);
}
