'use client';

import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder, Plus, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { api } from '@/modules/tasks/lib/api';
import type { BoardDto, SearchResults } from '@/modules/tasks/lib/api-types';
import { firstLine, snippet } from '@/modules/tasks/lib/search-text';
import { useDndAccessibility } from '@/modules/tasks/lib/use-dnd-accessibility';

interface BoardSidebarProps {
  boards: BoardDto[];
  openId: number | null;
  onReorder(event: DragEndEvent): void;
  onSelect(id: number): void;
  onCreate(): void;
  /** A search result was opened. */
  onOpened?(): void;
}

function SortableBoardRow({ board, selected, onSelect }: { board: BoardDto; selected: boolean; onSelect(): void }) {
  const t = useTranslations('tasks.boards');
  const tDrag = useTranslations('tasks.dragAndDrop');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: board.id,
    attributes: { roleDescription: tDrag('sortable') },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      className="touch-draggable"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors md:py-2',
          selected ? 'bg-accent text-accent-ink shadow-xs' : 'text-ink hover:bg-muted',
        )}
        title={t('reorder')}
      >
        <Folder size={15} className={cn('shrink-0', selected ? 'text-accent-ink' : 'text-ink-muted')} />
        <span className="truncate">{board.title}</span>
      </button>
    </div>
  );
}

const groupLabel = 'px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-faint uppercase';
const resultRow = 'block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted';

/** Search above the account's boards, which drag to reorder, and a new one at the foot. */
export function BoardSidebar({ boards, openId, onReorder, onSelect, onCreate, onOpened }: BoardSidebarProps) {
  const t = useTranslations('tasks.search');
  const tBoards = useTranslations('tasks.boards');
  const tApp = useTranslations('tasks.app');
  const tStickies = useTranslations('tasks.stickyNotes');
  const { openHit } = useTasks();
  const dndAccessibility = useDndAccessibility();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; data: SearchResults } | null>(null);
  const trimmed = query.trim();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!trimmed) return;
    let stale = false;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.search(trimmed);
        if (!stale) setResults({ query: trimmed, data });
      } catch {
        if (!stale) setResults({ query: trimmed, data: { tasks: [], todos: [], stickyNotes: [] } });
      }
    }, 200);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const current = results && results.query === trimmed ? results.data : null;
  const total = current ? current.tasks.length + current.todos.length + current.stickyNotes.length : 0;

  const open = (...args: Parameters<typeof openHit>) => {
    openHit(...args);
    onOpened?.();
  };

  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-line px-2">
        <div className="relative w-full">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('placeholder')}
            aria-label={t('label')}
            className="h-9 w-full appearance-none rounded-lg border border-line bg-raised pr-8 pl-9 text-base text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/25 md:h-8 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-faint hover:text-ink-muted"
              aria-label={t('clear')}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="themed-scroll flex-1 overflow-y-auto overscroll-contain p-2">
        {trimmed ? (
          <div aria-live="polite">
            {!current ? <p className="px-1 py-6 text-center text-xs text-ink-muted">{t('searching')}</p> : null}
            {current && total === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-ink-muted">{t('noResults', { query: trimmed })}</p>
            ) : null}

            {current && current.tasks.length > 0 ? (
              <>
                <div className={cn(groupLabel, 'pt-1')}>{t('tasks')}</div>
                {current.tasks.map(task => (
                  <button key={task.id} type="button" onClick={() => open({ type: 'task', id: task.id, boardId: task.boardId })} className={resultRow}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={`priority-${task.priority.toLowerCase()} priority-dot size-1.5 shrink-0 rounded-full`} />
                      <span className="truncate text-sm font-medium text-ink">{task.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-muted">
                      {task.boardTitle} › {task.sectionTitle}
                    </span>
                    {snippet(task.description, trimmed) ? (
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">{snippet(task.description, trimmed)}</span>
                    ) : null}
                  </button>
                ))}
              </>
            ) : null}

            {current && current.todos.length > 0 ? (
              <>
                <div className={groupLabel}>{tApp('todo')}</div>
                {current.todos.map(todo => (
                  <button key={todo.id} type="button" onClick={() => open({ type: 'todo', id: todo.id })} className={resultRow}>
                    <span className={cn('block truncate text-sm font-medium', todo.completed ? 'text-ink-faint line-through' : 'text-ink')}>
                      {todo.title}
                    </span>
                    {snippet(todo.description, trimmed) ? (
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">{snippet(todo.description, trimmed)}</span>
                    ) : null}
                  </button>
                ))}
              </>
            ) : null}

            {current && current.stickyNotes.length > 0 ? (
              <>
                <div className={groupLabel}>{tApp('stickies')}</div>
                {current.stickyNotes.map(note => (
                  <button key={note.id} type="button" onClick={() => open({ type: 'stickyNote', id: note.id })} className={resultRow}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={`sticky-${note.color} sticky-swatch size-3 shrink-0 rounded-[3px] border`} />
                      <span className="truncate text-sm font-medium text-ink">
                        {snippet(note.content, trimmed) ?? (firstLine(note.content) || tStickies('emptyNote'))}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={dndAccessibility} onDragEnd={onReorder}>
              <SortableContext items={boards.map(board => board.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-0.5">
                  {boards.map(board => (
                    <SortableBoardRow key={board.id} board={board} selected={openId === board.id} onSelect={() => onSelect(board.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {boards.length === 0 ? <p className="px-1 py-6 text-center text-xs text-ink-muted">{tBoards('empty')}</p> : null}
            <button
              type="button"
              onClick={onCreate}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink md:py-2"
            >
              <Plus size={15} className="shrink-0" />
              {tBoards('new')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
