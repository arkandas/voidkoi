'use client';

import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, MoreHorizontal, PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, type CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import type { FolderChanges, NoteDto, NoteFolderDto } from '@/modules/notes/lib/api-types';
import { folderColor } from '@/modules/notes/lib/folders';

import { FolderGlyph, FolderMenu, inkOf, swatchOf } from './folder-menu';

export interface RowProps {
  selectedId: number | null;
  /** The note locked on the left while it shows there. It can't be picked until the left pane closes. */
  pinnedId: number | null;
  /** Whether a note can go on the left now: on a wide screen, with none there yet. */
  canPin: boolean;
  onSelect(note: NoteDto): void;
  onPin(note: NoteDto): void;
  formatDate(iso: string): string;
}

/**
 * A note in the list: drag it to reorder or to another folder, or put it on the left to read beside the one
 * being written. Three looks: the note being written (solid), the one on the left (tinted, locked), and the rest.
 */
export function NoteRow({ note, query, inkColor, selectedId, pinnedId, canPin, onSelect, onPin, formatDate }: RowProps & {
  note: NoteDto;
  query?: string;
  inkColor?: string | null;
}) {
  const t = useTranslations('notes');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  const selected = note.id === selectedId;
  const pinned = note.id === pinnedId;

  const snippet = useMemo(() => {
    if (!query) return null;
    const at = note.content.toLowerCase().indexOf(query.toLowerCase());
    if (at === -1) return null;
    const from = Math.max(0, at - 24);
    return (from > 0 ? '…' : '') + note.content.slice(from, at + query.length + 40).replace(/\n/g, ' ');
  }, [note.content, query]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
      className="group/note relative"
    >
      <button
        type="button"
        onClick={() => {
          if (!pinned) onSelect(note);
        }}
        aria-current={selected ? 'true' : undefined}
        aria-disabled={pinned || undefined}
        title={pinned ? t('side.locked') : undefined}
        className={cn(
          'w-full rounded-lg px-3 py-2.5 text-left transition-colors md:py-2',
          selected
            ? 'bg-accent text-accent-ink shadow-xs'
            : pinned
              ? 'cursor-default bg-accent-soft text-accent ring-1 ring-accent/30 ring-inset'
              : 'text-ink group-hover/note:bg-muted',
          pinned || (selected && canPin) ? 'md:pr-9' : canPin ? 'md:group-hover/note:pr-9 md:[@media(hover:none)]:pr-9' : '',
        )}
      >
        <div className="truncate text-sm font-medium" style={!selected && !pinned && inkColor ? { color: inkColor } : undefined}>
          {note.title || t('untitled')}
        </div>
        <div className={cn('mt-0.5 truncate text-xs', selected ? 'text-accent-ink' : pinned ? 'text-accent/80' : 'text-ink-muted')}>
          {snippet ?? formatDate(note.updatedAt)}
        </div>
      </button>
      {pinned ? (
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 text-accent md:block">
          <PanelLeft size={15} />
        </span>
      ) : canPin ? (
        <button
          type="button"
          onClick={() => onPin(note)}
          onPointerDown={event => event.stopPropagation()}
          title={t('side.open')}
          aria-label={t('side.open')}
          className={cn(
            'absolute top-1/2 right-1.5 hidden size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors md:flex',
            selected
              ? 'text-accent-ink hover:bg-black/10'
              : 'text-ink-muted opacity-0 group-hover/note:opacity-100 hover:bg-line hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <PanelLeft size={15} />
        </button>
      ) : null}
    </div>
  );
}

/** The notes in no folder, under the folders. Dropping a note here takes it out of its folder. */
function UnfiledNotes({ notes, dragging, ...row }: RowProps & { notes: NoteDto[]; dragging: boolean }) {
  const t = useTranslations('notes.list');
  const { setNodeRef, isOver } = useDroppable({ id: '' });

  return (
    <div ref={setNodeRef} className={cn('mt-1 rounded-lg px-2 py-1 transition-colors', isOver && 'bg-accent-soft ring-1 ring-accent')}>
      <SortableContext items={notes.map(note => note.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {notes.map(note => (
            <NoteRow key={note.id} note={note} {...row} />
          ))}
        </div>
      </SortableContext>
      {notes.length === 0 && dragging ? (
        <p className="rounded-md border border-dashed border-line-strong px-2 py-3 text-center text-xs text-ink-muted">{t('dropToUnfile')}</p>
      ) : null}
    </div>
  );
}

/** A folder: its chip, which opens and closes it, and its notes. */
function FolderSection({
  folder,
  notes,
  collapsed,
  onToggle,
  onChange,
  onRename,
  onDelete,
  onNewNote,
  ...row
}: RowProps & {
  folder: NoteFolderDto;
  notes: NoteDto[];
  collapsed: boolean;
  onToggle(): void;
  onChange(changes: FolderChanges): void;
  onRename(name: string): void;
  onDelete(): void;
  onNewNote(): void;
}) {
  const t = useTranslations('notes.folder');
  const { setNodeRef, isOver } = useDroppable({ id: folder.name });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const color = folderColor(folder.color);
  const swatch = color ? swatchOf(color) : null;
  const ink = color ? inkOf(color) : null;
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const tint = (percent: number): string => `color-mix(in srgb, ${swatch} ${percent}%, transparent)`;
  const chip = {
    '--chip-bg': swatch ? tint(12) : 'transparent',
    '--chip-bg-hover': swatch ? tint(22) : 'var(--muted)',
    '--chip-border': swatch ? tint(35) : 'transparent',
    '--chip-badge': swatch ? tint(22) : 'var(--muted)',
    '--chip-action-hover': swatch ? tint(32) : 'var(--line)',
  } as CSSProperties;

  /** On blur, which Enter brings about too, so the name is taken once. Escape leaves it as it was. */
  const commitRename = (input: HTMLInputElement): void => {
    const next = input.value.trim();
    setRenaming(false);
    if (input.dataset.cancelled !== 'true' && next && next !== folder.name) onRename(next);
  };

  return (
    <div ref={setNodeRef} className={cn('mb-1.5 rounded-lg transition-colors', isOver && 'ring-1 ring-accent')}>
      <div className="relative px-2" style={chip}>
        <div className={cn('folder-chip flex items-center rounded-lg border pr-1 transition-colors', isOver && 'border-accent bg-accent-soft', renaming && 'border-accent ring-1 ring-accent')}>
          {renaming ? (
            <input
              autoFocus
              defaultValue={folder.name}
              maxLength={80}
              aria-label={t('rename')}
              onKeyDown={event => {
                if (event.key === 'Escape') event.currentTarget.dataset.cancelled = 'true';
                if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
              }}
              onBlur={event => commitRename(event.currentTarget)}
              className="h-[38px] min-w-0 flex-1 bg-transparent px-2 text-base font-semibold text-ink outline-hidden md:text-[15px]"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-l-lg px-2 py-2 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              {collapsed ? <ChevronRight size={15} className="shrink-0 text-ink-muted" /> : <ChevronDown size={15} className="shrink-0 text-ink-muted" />}
              <FolderGlyph
                icon={folder.icon}
                size={16}
                className={cn('shrink-0 transition-colors', isOver ? 'text-accent' : !ink && 'text-ink-muted')}
                style={!isOver && ink ? { color: ink } : undefined}
              />
              <span
                className={cn('ml-0.5 truncate text-[15px] font-semibold transition-colors', isOver ? 'text-accent' : 'text-ink')}
                style={!isOver && ink ? { color: ink } : undefined}
              >
                {folder.name}
              </span>
              <span
                className="ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-medium text-ink-muted tabular-nums"
                style={{ backgroundColor: isOver ? undefined : 'var(--chip-badge)' }}
              >
                {notes.length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            title={t('options', { name: folder.name })}
            aria-label={t('options', { name: folder.name })}
            aria-expanded={menuOpen}
            className="folder-chip-action flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {menuOpen ? (
          <FolderMenu
            color={color}
            icon={folder.icon}
            onChange={onChange}
            onClose={closeMenu}
            onNewNote={() => {
              setMenuOpen(false);
              onNewNote();
            }}
            onRename={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            onDelete={() => {
              setMenuOpen(false);
              onDelete();
            }}
          />
        ) : null}
      </div>

      {collapsed ? null : (
        <div className="mt-1.5 ml-4 flex flex-col gap-1 border-l pr-2 pl-2" style={{ borderColor: swatch ? tint(35) : 'var(--line)' }}>
          <SortableContext items={notes.map(note => note.id)} strategy={verticalListSortingStrategy}>
            {notes.map(note => (
              <NoteRow key={note.id} note={note} inkColor={ink} {...row} />
            ))}
          </SortableContext>
          {notes.length === 0 ? <p className="py-1 pl-3 text-xs text-ink-muted italic">{t('empty')}</p> : null}
        </div>
      )}
    </div>
  );
}

export interface TreeProps extends RowProps {
  notes: NoteDto[];
  folders: NoteFolderDto[];
  collapsed: ReadonlySet<string>;
  onToggleFolder(name: string): void;
  onFolderChange(folder: NoteFolderDto, changes: FolderChanges): void;
  onFolderRename(folder: NoteFolderDto, name: string): void;
  onFolderDelete(folder: NoteFolderDto): void;
  onNewNote(folder: string): void;
  /** A note dropped on another in its folder: its new place among them. */
  onReorder(note: NoteDto, over: NoteDto): void;
  /** A note dropped into another folder, or out of any ('' ). */
  onMove(note: NoteDto, folder: string): void;
}

/** The folders, then the notes in none, each in its order. Notes drag between them. */
export function NoteTree({
  notes,
  folders,
  collapsed,
  onToggleFolder,
  onFolderChange,
  onFolderRename,
  onFolderDelete,
  onNewNote,
  onReorder,
  onMove,
  ...row
}: TreeProps) {
  const t = useTranslations('notes');
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const byFolder = useMemo(() => {
    const groups = new Map<string, NoteDto[]>([['', []]]);
    for (const folder of folders) groups.set(folder.name, []);
    // A note whose folder is gone shows with those in none rather than nowhere.
    for (const note of notes) (groups.get(note.folder) ?? groups.get(''))!.push(note);
    for (const group of groups.values()) group.sort((a, b) => a.position - b.position);
    return groups;
  }, [notes, folders]);

  const dragged = draggingId === null ? null : notes.find(note => note.id === draggingId) ?? null;

  const dragEnd = (event: DragEndEvent): void => {
    setDraggingId(null);
    const note = notes.find(candidate => candidate.id === event.active.id);
    if (!note || !event.over) return;
    const overId = event.over.id;
    const over = typeof overId === 'number' ? notes.find(candidate => candidate.id === overId) : undefined;
    if (over && over.folder === note.folder) {
      if (over.id !== note.id) onReorder(note, over);
      return;
    }
    const folder = over ? over.folder : String(overId);
    if (folder !== note.folder) onMove(note, folder);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setDraggingId(event.active.id as number)}
      onDragEnd={dragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      {folders.map(folder => (
        <FolderSection
          key={folder.id}
          folder={folder}
          notes={byFolder.get(folder.name) ?? []}
          collapsed={collapsed.has(folder.name)}
          onToggle={() => onToggleFolder(folder.name)}
          onChange={changes => onFolderChange(folder, changes)}
          onRename={name => onFolderRename(folder, name)}
          onDelete={() => onFolderDelete(folder)}
          onNewNote={() => onNewNote(folder.name)}
          {...row}
        />
      ))}

      <UnfiledNotes notes={byFolder.get('') ?? []} dragging={draggingId !== null} {...row} />

      <DragOverlay>
        {dragged ? (
          <div className="w-44 rounded-lg border border-accent bg-raised px-3 py-2 opacity-90 shadow-lg dark:bg-card">
            <div className="truncate text-sm font-semibold text-ink">{dragged.title || t('untitled')}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
