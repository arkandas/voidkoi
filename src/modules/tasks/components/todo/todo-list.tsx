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
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ListTodo, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button, EmptyState, Spinner, useToast } from '@/components/ui';
import { useApiError } from '@/lib/use-api-error';
import { LoadFailed } from '@/modules/tasks/components/load-failed';
import { useTasks } from '@/modules/tasks/components/tasks-context';
import { api, type ItemInput } from '@/modules/tasks/lib/api';
import type { TodoDto } from '@/modules/tasks/lib/api-types';
import { useDndAccessibility } from '@/modules/tasks/lib/use-dnd-accessibility';

import { TodoDialog } from './todo-dialog';
import { SortableTodoItem, TodoItem } from './todo-item';

/** What is left first, in the order it was put in, then what is done. */
const byListOrder = (a: TodoDto, b: TodoDto) =>
  Number(a.completed) - Number(b.completed) || a.position - b.position || b.createdAt.localeCompare(a.createdAt);

const groupHeading = 'flex items-center gap-2 text-[11px] font-semibold tracking-wider text-ink-muted uppercase';

/** The to-do list: a list of its own, outside the boards. */
export function TodoList() {
  const t = useTranslations('tasks.todos');
  const tApp = useTranslations('tasks.app');
  const toast = useToast();
  const apiError = useApiError();
  const dndAccessibility = useDndAccessibility();
  const { hit } = useTasks();
  const [todos, setTodos] = useState<TodoDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ todo: TodoDto | null } | null>(null);
  const [dragged, setDragged] = useState<TodoDto | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const highlightId = hit?.type === 'todo' ? hit.id : null;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    api.todos().then(
      loaded => {
        if (!current) return;
        setTodos(loaded);
        setFailed(null);
      },
      error => {
        if (current) setFailed(apiError(error, 'loadFailed'));
      },
    );
    return () => {
      current = false;
    };
  }, [apiError, attempt]);

  const count = todos?.length ?? 0;
  useEffect(() => {
    if (!highlightId) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-todo-id="${highlightId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightId, count]);

  const ordered = [...(todos ?? [])].sort(byListOrder);
  const active = ordered.filter(todo => !todo.completed);
  const completed = ordered.filter(todo => todo.completed);

  const replace = (todo: TodoDto) => setTodos(current => current?.map(other => (other.id === todo.id ? todo : other)) ?? null);

  const save = async (input: ItemInput): Promise<void> => {
    const editing = dialog?.todo ?? null;
    try {
      if (editing) {
        replace(await api.updateTodo(editing.id, input));
      } else {
        const created = await api.createTodo(input);
        setTodos(current => [created, ...(current ?? [])]);
      }
      setDialog(null);
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const remove = async (todo: TodoDto): Promise<void> => {
    try {
      await api.deleteTodo(todo.id);
      setTodos(current => current?.filter(other => other.id !== todo.id) ?? null);
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    }
  };

  const toggle = async (todo: TodoDto): Promise<void> => {
    try {
      replace(await api.updateTodo(todo.id, { completed: !todo.completed }));
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const clearCompleted = async (): Promise<void> => {
    const ids = completed.map(todo => todo.id);
    const results = await Promise.allSettled(ids.map(id => api.deleteTodo(id)));
    const deleted = new Set(ids.filter((_, index) => results[index]!.status === 'fulfilled'));
    setTodos(current => current?.filter(todo => !deleted.has(todo.id)) ?? null);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) toast.show(apiError(failure.reason, 'deleteFailed'), 'error');
  };

  const onDragStart = (event: DragStartEvent) => {
    setDragged(todos?.find(todo => todo.id === event.active.id) ?? null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active: moved, over } = event;
    setDragged(null);
    if (!over || moved.id === over.id || !todos) return;
    const from = ordered.findIndex(todo => todo.id === moved.id);
    const to = ordered.findIndex(todo => todo.id === over.id);
    if (from === -1 || to === -1) return;

    const before = todos;
    setTodos(arrayMove(ordered, from, to).map((todo, position) => ({ ...todo, position })));
    try {
      await api.updateTodo(moved.id as number, { position: to });
    } catch (error) {
      setTodos(before);
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const item = (todo: TodoDto) => (
    <SortableTodoItem
      key={todo.id}
      todo={todo}
      onDelete={todo => void remove(todo)}
      onEdit={todo => setDialog({ todo })}
      onToggle={todo => void toggle(todo)}
      highlighted={highlightId === todo.id}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={dndAccessibility}
      onDragStart={onDragStart}
      onDragEnd={event => void onDragEnd(event)}
      onDragCancel={() => setDragged(null)}
    >
      {failed && !todos ? (
        <LoadFailed message={failed} onRetry={() => setAttempt(count => count + 1)} className="h-full bg-surface" />
      ) : !todos ? (
        <div className="flex h-full items-center justify-center bg-surface">
          <Spinner />
        </div>
      ) : todos.length === 0 ? (
        <div className="h-full bg-surface">
          <EmptyState
            className="py-20"
            icon={<ListTodo size={24} />}
            title={t('empty')}
            action={
              <Button icon={<Plus size={16} />} onClick={() => setDialog({ todo: null })}>
                {t('new')}
              </Button>
            }
          />
        </div>
      ) : (
        <div ref={listRef} className="themed-scroll h-full overflow-y-auto overscroll-contain bg-surface px-4 py-5 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{tApp('todo')}</h1>
              <Button icon={<Plus size={16} />} onClick={() => setDialog({ todo: null })} className="h-11 shrink-0 text-base sm:h-10 sm:text-sm">
                {t('new')}
              </Button>
            </div>

            {active.length > 0 ? (
              <section className="space-y-2.5">
                <h2 className={groupHeading}>
                  <ListTodo size={14} aria-hidden="true" />
                  {t('active')}
                  <span className="tabular-nums">{active.length}</span>
                </h2>
                <SortableContext items={active.map(todo => todo.id)} strategy={verticalListSortingStrategy}>
                  {active.map(item)}
                </SortableContext>
              </section>
            ) : null}

            {completed.length > 0 ? (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className={groupHeading}>
                    <ListTodo size={14} aria-hidden="true" />
                    {t('completed')}
                    <span className="tabular-nums">{completed.length}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => void clearCompleted()}
                    className="-my-2 flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    title={t('clearCompleted')}
                    aria-label={t('clearCompleted')}
                  >
                    <Trash2 size={14} />
                    {t('clear')}
                  </button>
                </div>
                <SortableContext items={completed.map(todo => todo.id)} strategy={verticalListSortingStrategy}>
                  {completed.map(item)}
                </SortableContext>
              </section>
            ) : null}
          </div>
        </div>
      )}

      <TodoDialog open={dialog !== null} todo={dialog?.todo ?? null} onClose={() => setDialog(null)} onSave={save} />

      <DragOverlay dropAnimation={null}>
        {dragged ? (
          <div className="rotate-1 cursor-grabbing">
            <TodoItem todo={dragged} onDelete={() => {}} onEdit={() => {}} onToggle={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
