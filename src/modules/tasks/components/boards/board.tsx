'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Edit3, Menu, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button, Confirm, Input, Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';
import { LoadFailed } from '@/modules/tasks/components/load-failed';
import { Markdown } from '@/modules/tasks/components/markdown';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { api, type BoardInput, type ItemInput } from '@/modules/tasks/lib/api';
import type { BoardDetail, SectionWithTasks, TaskDto } from '@/modules/tasks/lib/api-types';
import { useDndAccessibility } from '@/modules/tasks/lib/use-dnd-accessibility';
import { MAX_SECTIONS } from '@/modules/tasks/lib/validate';

import { EditBoardDialog } from './board-form-dialogs';
import { useBoards } from './boards-frame';
import { SectionColumn } from './section-column';
import { TaskCard } from './task-card';
import { TaskDialog, type TaskDialogState } from './task-dialog';

/** How far from the left edge a section settles when the columns snap, on a phone. */
const SECTION_SNAP_OFFSET = 12;
const SECTION_WIDTH =
  'w-[86vw] min-w-[250px] max-w-[330px] sm:w-[220px] sm:min-w-[180px] sm:max-w-none md:w-[230px] lg:w-[240px] xl:w-[250px]';

const strong = (chunks: ReactNode) => <strong className="text-ink">{chunks}</strong>;

type DragData = { type: 'task'; task: TaskDto } | { type: 'section'; section: SectionWithTasks };

/** The section a drag is over: the section itself, or the one the task under it is in. */
function sectionOver(over: DragOverEvent['over']): number | null {
  if (!over) return null;
  const data = over.data.current as DragData | undefined;
  if (data?.type === 'section') return data.section.id;
  if (data?.type === 'task') return data.task.sectionId;
  if (typeof over.id === 'string' && over.id.startsWith('section-')) return Number(over.id.slice('section-'.length));
  return null;
}

/** A board: its title, and its sections side by side with their tasks, which drag between them. */
export function Board({ id }: { id: number }) {
  const t = useTranslations('tasks.board');
  const tSection = useTranslations('tasks.section');
  const tTask = useTranslations('tasks.task');
  const tActions = useTranslations('tasks.actions');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const dndAccessibility = useDndAccessibility();
  const { hit, setLastBoard } = useTasks();
  const { changed, removed, showList } = useBoards();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [dragged, setDragged] = useState<TaskDto | null>(null);
  const [overSection, setOverSection] = useState<number | null>(null);
  const [editingBoard, setEditingBoard] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<SectionWithTasks | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TaskDto | null>(null);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const highlightTaskId = hit?.type === 'task' && hit.boardId === id ? hit.id : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    api.board(id).then(
      loaded => {
        if (!current) return;
        setBoard(loaded);
        setFailed(null);
        setLastBoard(loaded.id);
      },
      error => {
        if (!current) return;
        if (error instanceof ApiError && error.status === 404) {
          // Deleted elsewhere, or never this account's: to the boards it has.
          toast.show(tErrors('notFound'), 'error');
          router.replace('/tasks/boards');
          return;
        }
        setFailed(apiError(error, 'loadFailed'));
      },
    );
    return () => {
      current = false;
    };
  }, [id, attempt, setLastBoard, toast, tErrors, router, apiError]);

  const loaded = board !== null;
  const sectionCount = board?.sections.length ?? 0;

  /** On a phone: which column has snapped into view, for the tabs above. */
  const syncActiveSection = useCallback(() => {
    const scroller = sectionsRef.current;
    if (!scroller) return;
    const columns = Array.from(scroller.querySelectorAll<HTMLElement>('[data-section-id]'));
    if (columns.length === 0) {
      setActiveSection(null);
      return;
    }
    const snapLine = scroller.getBoundingClientRect().left + SECTION_SNAP_OFFSET;
    let closest = columns[0]!;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const column of columns) {
      const distance = Math.abs(column.getBoundingClientRect().left - snapLine);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = column;
      }
    }
    const sectionId = Number(closest.dataset.sectionId);
    setActiveSection(current => (current === sectionId ? current : sectionId));
  }, []);

  useEffect(() => {
    const scroller = sectionsRef.current;
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncActiveSection);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    frame = requestAnimationFrame(syncActiveSection);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [syncActiveSection, loaded, sectionCount]);

  useEffect(() => {
    if (!highlightTaskId || !loaded) return;
    const frame = requestAnimationFrame(() => {
      sectionsRef.current
        ?.querySelector<HTMLElement>(`[data-task-id="${highlightTaskId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightTaskId, loaded]);

  useEffect(() => {
    if (!addingSection) return;
    const scroller = sectionsRef.current;
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  }, [addingSection]);

  useEffect(() => {
    if (activeSection === null) return;
    const tabs = tabsRef.current;
    const tab = tabs?.querySelector<HTMLElement>(`[data-section-tab="${activeSection}"]`);
    if (!tabs || !tab) return;
    const tabsBox = tabs.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < tabsBox.left + SECTION_SNAP_OFFSET) {
      tabs.scrollTo({ left: tabs.scrollLeft + (tabBox.left - tabsBox.left) - SECTION_SNAP_OFFSET, behavior: 'smooth' });
    } else if (tabBox.right > tabsBox.right - SECTION_SNAP_OFFSET) {
      tabs.scrollTo({ left: tabs.scrollLeft + (tabBox.right - tabsBox.right) + SECTION_SNAP_OFFSET, behavior: 'smooth' });
    }
  }, [activeSection]);

  if (failed && !board) return <LoadFailed message={failed} onRetry={() => setAttempt(count => count + 1)} className="h-full bg-surface" />;
  if (!board) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <Spinner />
      </div>
    );
  }

  const scrollToSection = (sectionId: number) => {
    const scroller = sectionsRef.current;
    const column = scroller?.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
    if (!scroller || !column) return;
    const delta = column.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    scroller.scrollTo({ left: scroller.scrollLeft + delta - SECTION_SNAP_OFFSET, behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  const withSections = (update: (sections: SectionWithTasks[]) => SectionWithTasks[]) =>
    setBoard(current => (current ? { ...current, sections: update(current.sections) } : current));

  const withTask = (taskId: number, update: (task: TaskDto) => TaskDto) =>
    withSections(sections => sections.map(section => ({ ...section, tasks: section.tasks.map(task => (task.id === taskId ? update(task) : task)) })));

  const saveBoard = async (input: BoardInput): Promise<void> => {
    try {
      const saved = await api.updateBoard(board.id, input);
      setBoard(current => (current ? { ...current, ...saved } : current));
      changed(saved);
      setEditingBoard(false);
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const deleteBoard = async (): Promise<void> => {
    try {
      await api.deleteBoard(board.id);
      setDeletingBoard(false);
      removed(board.id);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const cancelNewSection = () => {
    setAddingSection(false);
    setNewSectionTitle('');
  };

  const createSection = async (): Promise<void> => {
    const title = newSectionTitle.trim();
    if (!title) return;
    if (board.sections.length >= MAX_SECTIONS) {
      setAddingSection(false);
      return;
    }
    try {
      const section = await api.createSection(board.id, title);
      withSections(sections => [...sections, { ...section, tasks: [] }]);
      cancelNewSection();
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const renameSection = async (sectionId: number, title: string): Promise<void> => {
    try {
      const saved = await api.renameSection(sectionId, title);
      withSections(sections => sections.map(section => (section.id === sectionId ? { ...section, title: saved.title } : section)));
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
      throw error;
    }
  };

  const deleteSection = async (): Promise<void> => {
    if (!sectionToDelete) return;
    try {
      await api.deleteSection(sectionToDelete.id);
      withSections(sections => sections.filter(section => section.id !== sectionToDelete.id));
      setSectionToDelete(null);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const saveTask = async (input: ItemInput, sectionId: number): Promise<void> => {
    if (!taskDialog) return;
    try {
      if (taskDialog.mode === 'create') {
        const task = await api.createTask(sectionId, input);
        withSections(sections => sections.map(section => (section.id === sectionId ? { ...section, tasks: [...section.tasks, task] } : section)));
      } else {
        const original = taskDialog.task;
        const saved = await api.updateTask(original.id, input);
        const target = board.sections.find(section => section.id === sectionId);
        if (target && sectionId !== original.sectionId) {
          // Chosen from the list on a phone: to the end of the other section.
          await api.moveTask(original.id, target.id, target.tasks.length);
          withSections(sections =>
            sections.map(section => {
              if (section.id === original.sectionId) return { ...section, tasks: section.tasks.filter(task => task.id !== original.id) };
              if (section.id === target.id) return { ...section, tasks: [...section.tasks, { ...saved, sectionId: target.id }] };
              return section;
            }),
          );
        } else {
          withTask(original.id, () => saved);
        }
      }
      setTaskDialog(null);
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
      throw error;
    }
  };

  const deleteTask = async (): Promise<void> => {
    if (!taskToDelete) return;
    try {
      await api.deleteTask(taskToDelete.id);
      withSections(sections => sections.map(section => ({ ...section, tasks: section.tasks.filter(task => task.id !== taskToDelete.id) })));
      setTaskToDelete(null);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.type === 'task') setDragged(data.task);
  };

  const onDragOver = (event: DragOverEvent) => setOverSection(sectionOver(event.over));

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragged(null);
    setOverSection(null);
    if (!over || active.id === over.id) return;
    const data = active.data.current as DragData | undefined;
    if (data?.type !== 'task') return;

    const moved = data.task;
    const targetId = sectionOver(over);
    const target = board.sections.find(section => section.id === targetId);
    if (!target) return;
    const overData = over.data.current as DragData | undefined;
    const overIndex = overData?.type === 'task' ? target.tasks.findIndex(task => task.id === overData.task.id) : -1;

    let position: number;
    let sections = board.sections;
    if (moved.sectionId === target.id) {
      const from = target.tasks.findIndex(task => task.id === moved.id);
      position = overIndex === -1 ? target.tasks.length - 1 : overIndex;
      if (from === -1 || from === position) return;
      sections = sections.map(section => (section.id === target.id ? { ...section, tasks: arrayMove(section.tasks, from, position) } : section));
    } else {
      position = overIndex === -1 ? target.tasks.length : overIndex;
      sections = sections.map(section => {
        if (section.id === moved.sectionId) return { ...section, tasks: section.tasks.filter(task => task.id !== moved.id) };
        if (section.id === target.id) {
          const tasks = [...section.tasks];
          tasks.splice(position, 0, { ...moved, sectionId: target.id });
          return { ...section, tasks };
        }
        return section;
      });
    }

    const before = board.sections;
    withSections(() => sections);
    try {
      await api.moveTask(moved.id, target.id, position);
    } catch (error) {
      withSections(() => before);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const taskCount = board.sections.reduce((count, section) => count + section.tasks.length, 0);
  const canAddSection = board.sections.length < MAX_SECTIONS;

  return (
    <>
      <EditBoardDialog
        board={editingBoard ? board : null}
        onClose={() => setEditingBoard(false)}
        onSave={saveBoard}
        onDelete={() => {
          setEditingBoard(false);
          setDeletingBoard(true);
        }}
      />

      <Confirm
        open={deletingBoard}
        title={t('delete')}
        confirmLabel={t('delete')}
        danger
        onConfirm={deleteBoard}
        onCancel={() => setDeletingBoard(false)}
      >
        {t.rich('deleteConfirm', { title: board.title, strong })}
        {board.sections.length > 0 ? (
          <span className="mt-2 block font-medium text-danger">{t('deleteContents', { sections: board.sections.length, tasks: taskCount })}</span>
        ) : null}
      </Confirm>

      <Confirm
        open={sectionToDelete !== null}
        title={tSection('deleteTitle')}
        confirmLabel={tActions('delete')}
        danger
        onConfirm={deleteSection}
        onCancel={() => setSectionToDelete(null)}
      >
        {tSection.rich('deleteConfirm', { title: sectionToDelete?.title ?? '', strong })}
        {sectionToDelete && sectionToDelete.tasks.length > 0 ? (
          <span className="mt-2 block font-medium text-danger">{tSection('deleteTasks', { count: sectionToDelete.tasks.length })}</span>
        ) : null}
      </Confirm>

      <Confirm
        open={taskToDelete !== null}
        title={tTask('deleteTitle')}
        confirmLabel={tActions('delete')}
        danger
        onConfirm={deleteTask}
        onCancel={() => setTaskToDelete(null)}
      >
        {tTask.rich('deleteConfirm', { title: taskToDelete?.title ?? '', strong })}
      </Confirm>

      <TaskDialog
        state={taskDialog}
        sections={board.sections}
        onClose={() => setTaskDialog(null)}
        onSave={saveTask}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={dndAccessibility}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={event => void onDragEnd(event)}
        onDragCancel={() => {
          setDragged(null);
          setOverSection(null);
        }}
      >
        <div className="flex h-full flex-col bg-surface">
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-3 sm:px-4">
            <button
              type="button"
              onClick={showList}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas md:hidden"
              aria-label={t('showBoards')}
            >
              <Menu size={20} />
            </button>

            <h1 className="min-w-0 shrink-0 truncate text-base font-bold text-ink max-sm:flex-1 sm:max-w-[45%] sm:text-lg">{board.title}</h1>

            {board.description ? (
              <Markdown plain className="hidden min-w-0 flex-1 text-sm text-ink-muted sm:block [&_*]:m-0 [&_*]:truncate">
                {board.description}
              </Markdown>
            ) : (
              <span className="hidden flex-1 sm:block" />
            )}

            <Button
              variant="outline"
              icon={<Edit3 size={16} />}
              onClick={() => setEditingBoard(true)}
              title={t('editLabel')}
              aria-label={t('editLabel')}
              className="shrink-0 max-sm:w-10 max-sm:px-0"
            >
              <span className="hidden sm:inline">{t('edit')}</span>
            </Button>
          </div>

          {board.sections.length > 0 ? (
            <div
              ref={tabsRef}
              className="scrollbar-hidden flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-3 py-1.5 sm:hidden"
            >
              {board.sections.map(section => {
                const current = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-section-tab={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={cn(
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                      current ? 'bg-accent text-accent-ink' : 'bg-canvas text-ink-muted active:bg-muted',
                    )}
                  >
                    <span className="max-w-[7.5rem] truncate">{section.title}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                        current ? 'bg-accent-ink/20 text-accent-ink' : 'bg-surface text-ink-muted',
                      )}
                    >
                      {section.tasks.length}
                    </span>
                  </button>
                );
              })}
              {canAddSection ? (
                <button
                  type="button"
                  onClick={() => setAddingSection(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-muted transition-colors active:bg-muted"
                  aria-label={t('addSectionLabel')}
                >
                  <Plus size={16} />
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            ref={sectionsRef}
            className={cn(
              'sections-scroll themed-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-3 sm:overflow-y-auto sm:px-4 sm:pb-6 md:px-5',
              dragged && 'is-dragging',
            )}
          >
            <div className="flex h-full min-w-full items-stretch gap-3 sm:h-auto sm:items-start">
              <div className="hidden flex-1 sm:block" />
              <div className="flex h-full items-stretch gap-3 pr-3 sm:h-auto sm:items-start sm:pr-0">
                {board.sections.map(section => (
                  <SectionColumn
                    key={section.id}
                    section={section}
                    widthClass={SECTION_WIDTH}
                    onRename={renameSection}
                    onDelete={setSectionToDelete}
                    onAddTask={sectionId => setTaskDialog({ mode: 'create', sectionId })}
                    onEditTask={task => setTaskDialog({ mode: 'edit', task })}
                    onDeleteTask={setTaskToDelete}
                    draggedOver={overSection === section.id}
                    highlightTaskId={highlightTaskId}
                  />
                ))}

                {canAddSection ? (
                  addingSection ? (
                    <div className={cn('section-col shrink-0 self-start rounded-xl border border-line bg-canvas p-3 shadow-xs', SECTION_WIDTH)}>
                      <Input
                        value={newSectionTitle}
                        onChange={event => setNewSectionTitle(event.target.value)}
                        placeholder={t('sectionPlaceholder')}
                        aria-label={tSection('titleLabel')}
                        maxLength={200}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void createSection();
                          if (event.key === 'Escape') cancelNewSection();
                        }}
                        autoFocus
                      />
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => void createSection()}>
                          {t('addSection')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={cancelNewSection}>
                          {tCommon('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingSection(true)}
                      className={cn(
                        'section-col flex h-12 shrink-0 items-center justify-center gap-2 self-start rounded-xl border-2 border-dashed border-line-strong text-sm font-medium text-ink-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent',
                        SECTION_WIDTH,
                      )}
                    >
                      <Plus size={18} />
                      {t('addSection')}
                    </button>
                  )
                ) : null}
              </div>
              <div className="flex-1" />
            </div>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragged ? (
            <div className="rotate-2 cursor-grabbing">
              <TaskCard task={dragged} onEdit={() => {}} onDelete={() => {}} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
