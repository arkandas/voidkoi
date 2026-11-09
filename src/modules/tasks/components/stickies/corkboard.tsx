'use client';

import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Plus, RotateCcw, StickyNote as StickyNoteIcon, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, EmptyState, Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useApiError } from '@/lib/use-api-error';
import { LoadFailed } from '@/modules/tasks/components/load-failed';
import { Markdown } from '@/modules/tasks/components/markdown';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { api, type StickyInput } from '@/modules/tasks/lib/api';
import type { StickyNoteDto } from '@/modules/tasks/lib/api-types';
import { stickyColorClass } from '@/modules/tasks/lib/sticky-colors';
import { useDndAccessibility } from '@/modules/tasks/lib/use-dnd-accessibility';
import { TRASH_LIMIT } from '@/modules/tasks/lib/validate';

import { StickyNote, StickyNotePreview } from './sticky-note';

const NOTE_SIZE = 200;
/** Room kept clear around the edges of the board. */
const PADDING = 20;
/** Room kept clear at the top for the buttons, where a new note lands. */
const TOP_RESERVE = 72;

const topZ = (notes: StickyNoteDto[]) => Math.max(0, ...notes.map(note => note.z));

/** The sticky notes: a cork board to put them anywhere on, and the trash of the ones deleted. */
export function Corkboard() {
  const t = useTranslations('tasks.stickyNotes');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const apiError = useApiError();
  const dndAccessibility = useDndAccessibility();
  const { hit } = useTasks();
  const [notes, setNotes] = useState<StickyNoteDto[] | null>(null);
  const [trash, setTrash] = useState<StickyNoteDto[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [dragged, setDragged] = useState<StickyNoteDto | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const highlightId = hit?.type === 'stickyNote' ? hit.id : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

  const loadTrash = useCallback(async () => {
    try {
      setTrash(await api.trash());
    } catch (error) {
      toast.show(apiError(error, 'loadFailed'), 'error');
    }
  }, [toast, apiError]);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    api.stickyNotes().then(
      loaded => {
        if (!current) return;
        setNotes(loaded);
        setFailed(null);
      },
      error => {
        if (current) setFailed(apiError(error, 'loadFailed'));
      },
    );
    api.trash().then(
      loaded => {
        if (current) setTrash(loaded);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [apiError, attempt]);

  const boardSize = () => ({
    width: boardRef.current?.clientWidth ?? window.innerWidth,
    height: boardRef.current?.clientHeight ?? window.innerHeight,
  });

  const create = async (): Promise<void> => {
    if (!notes) return;
    const { width, height } = boardSize();
    const maxX = Math.max(PADDING, width - NOTE_SIZE - PADDING);
    const maxY = Math.max(TOP_RESERVE, height - NOTE_SIZE - PADDING);
    try {
      const created = await api.createStickyNote({
        content: '',
        color: 'yellow',
        x: Math.max(PADDING, Math.min(maxX, PADDING + Math.random() * (maxX - PADDING))),
        y: Math.max(TOP_RESERVE, Math.min(maxY, TOP_RESERVE + Math.random() * (maxY - TOP_RESERVE))),
        width: NOTE_SIZE,
        height: NOTE_SIZE,
        z: topZ(notes) + 1,
      });
      setNotes(current => [...(current ?? []), created]);
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  /** Saves changes to a note. With none, brings it to the front. Throws when it can't save. */
  const update = async (id: number, changes: StickyInput): Promise<void> => {
    const current = notes ?? [];
    const next = { ...changes };
    try {
      if (Object.keys(changes).length === 0) {
        const top = topZ(current);
        if (top > 1000) {
          // Number the layers again from 0 before they grow without end.
          const renumbered = [...current].sort((a, b) => a.z - b.z).map((note, index) => ({ ...note, z: index }));
          setNotes(renumbered);
          await Promise.all(renumbered.map(note => api.updateStickyNote(note.id, { z: note.z })));
          next.z = renumbered.length;
        } else {
          next.z = top + 1;
        }
      }
      const saved = await api.updateStickyNote(id, next);
      setNotes(notes => notes?.map(note => (note.id === id ? saved : note)) ?? null);
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
      throw error;
    }
  };

  const remove = async (id: number): Promise<void> => {
    try {
      await api.trashStickyNote(id);
      setNotes(current => current?.filter(note => note.id !== id) ?? null);
      await loadTrash();
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const restore = async (id: number): Promise<void> => {
    try {
      const restored = await api.restoreStickyNote(id);
      setNotes(current => [...(current ?? []), restored]);
      setTrash(current => current.filter(note => note.id !== id));
    } catch (error) {
      toast.show(apiError(error, 'restoreFailed'), 'error');
    }
  };

  const emptyTrash = async (): Promise<void> => {
    try {
      await api.emptyTrash();
      setTrash([]);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    } finally {
      setConfirmEmpty(false);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; note?: StickyNoteDto } | undefined;
    if (data?.type === 'stickynote' && data.note) setDragged(data.note);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setDragged(null);
    const data = event.active.data.current as { type?: string; note?: StickyNoteDto } | undefined;
    if (data?.type !== 'stickynote' || !data.note || !notes) return;
    const note = data.note;
    const { width, height } = boardSize();
    const place = {
      x: Math.max(PADDING, Math.min(Math.max(PADDING, width - note.width - PADDING), note.x + event.delta.x)),
      y: Math.max(PADDING, Math.min(Math.max(PADDING, height - note.height - PADDING), note.y + event.delta.y)),
    };
    if (place.x === note.x && place.y === note.y) return;

    const z = topZ(notes) + 1;
    setNotes(current => current?.map(other => (other.id === note.id ? { ...other, ...place, z } : other)) ?? null);
    try {
      await api.updateStickyNote(note.id, { ...place, z });
    } catch (error) {
      setNotes(current => current?.map(other => (other.id === note.id ? { ...other, x: note.x, y: note.y, z: note.z } : other)) ?? null);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const trashShown = showTrash && !highlightId;
  const floating = 'h-9 shadow-md sm:h-8';

  return (
    <div ref={boardRef} className="corkboard relative isolate h-full overflow-hidden">
      {notes ? (
        <>
          {trashShown ? (
            <div className="absolute top-3 left-3 z-[1100] sm:top-4 sm:left-4">
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink shadow-md sm:h-8">
                {t('trash')}
                {trash.length > 0 ? (
                  <span className="font-normal text-ink-muted tabular-nums">
                    {trash.length} / {TRASH_LIMIT}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}

          <div className="absolute top-3 right-3 z-[1100] flex gap-2 sm:top-4 sm:right-4">
            {trashShown ? (
              <>
                {trash.length > 0 ? (
                  confirmEmpty ? (
                    <>
                      <Button variant="destructive" size="sm" onClick={() => void emptyTrash()} className={floating}>
                        {t('deleteCount', { count: trash.length })}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmEmpty(false)} className={floating}>
                        {tCommon('cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmEmpty(true)}
                      className={cn(floating, 'text-danger hover:bg-danger-soft')}
                      aria-label={t('emptyTrash')}
                      icon={<Trash2 size={15} />}
                    >
                      <span className="hidden sm:inline">{t('emptyTrash')}</span>
                    </Button>
                  )
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowTrash(false);
                    setConfirmEmpty(false);
                  }}
                  className={floating}
                  aria-label={t('backToNotes')}
                  icon={<RotateCcw size={15} />}
                >
                  <span className="hidden sm:inline">{t('backToNotes')}</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTrash(true)}
                  className={floating}
                  aria-label={t('trashCount', { count: trash.length })}
                  icon={<Trash2 size={15} />}
                >
                  <span className="hidden sm:inline">{t('trash')}</span>
                  <span className="text-ink-muted tabular-nums">{trash.length}</span>
                </Button>
                <Button size="sm" onClick={() => void create()} className={floating} aria-label={t('add')} icon={<Plus size={15} />}>
                  <span className="hidden sm:inline">{t('add')}</span>
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}

      <div className="absolute inset-0">
        {failed && !notes ? (
          <LoadFailed message={failed} onRetry={() => setAttempt(count => count + 1)} className="h-full" />
        ) : !notes ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : trashShown ? (
          <div className="themed-scroll h-full overflow-y-auto overscroll-contain px-4 pt-16 pb-8 sm:px-8 sm:pt-20">
            {trash.length === 0 ? (
              <EmptyState className="py-20" icon={<Trash2 size={24} />} title={t('trashEmpty')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {trash.map(note => (
                  <div key={note.id} className={cn(stickyColorClass(note.color), 'relative flex h-48 flex-col rounded-lg border-2 p-4 shadow-lg')}>
                    <button
                      type="button"
                      onClick={() => void restore(note.id)}
                      className="sticky-menu absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg border shadow-md transition-transform hover:scale-110"
                      title={t('restore')}
                      aria-label={t('restore')}
                    >
                      <RotateCcw size={15} />
                    </button>
                    <div className="themed-scroll flex-1 overflow-y-auto pr-9 text-sm">
                      {note.content ? <Markdown>{note.content}</Markdown> : <span className="sticky-muted">{t('emptyNote')}</span>}
                    </div>
                    <div className="sticky-rule sticky-muted mt-2 border-t pt-2 text-xs">
                      {t('deleted', { date: new Date(note.deletedAt!).toLocaleDateString(locale) })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            className="py-20"
            icon={<StickyNoteIcon size={24} />}
            title={t('empty')}
            action={
              <Button icon={<Plus size={16} />} onClick={() => void create()}>
                {t('create')}
              </Button>
            }
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={dndAccessibility}
            onDragStart={onDragStart}
            onDragEnd={event => void onDragEnd(event)}
            onDragCancel={() => setDragged(null)}
          >
            {notes.map(note => (
              <StickyNote
                key={note.id}
                note={note}
                onUpdate={update}
                onDelete={id => void remove(id)}
                highlighted={highlightId === note.id}
              />
            ))}
            <DragOverlay>{dragged ? <StickyNotePreview note={dragged} /> : null}</DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
