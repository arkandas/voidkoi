'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Check, Clock, Edit2, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties, HTMLAttributes, Ref } from 'react';

import { cn } from '@/lib/cn';
import { Markdown } from '@/modules/tasks/components/markdown';
import type { TodoDto } from '@/modules/tasks/lib/api-types';
import { formatDeadline, isOverdue } from '@/modules/tasks/lib/deadline';

interface TodoItemProps {
  todo: TodoDto;
  onDelete(todo: TodoDto): void;
  onEdit(todo: TodoDto): void;
  onToggle(todo: TodoDto): void;
  /** Drawn under the pointer while it is dragged. */
  overlay?: boolean;
  highlighted?: boolean;
  /** What makes it draggable, from SortableTodoItem. */
  drag?: { ref: Ref<HTMLDivElement>; style: CSSProperties; props: HTMLAttributes<HTMLDivElement> };
}

/** One to-do: a box to tick, its title, its notes and its deadline. */
export function TodoItem({ todo, onDelete, onEdit, onToggle, overlay = false, highlighted = false, drag }: TodoItemProps) {
  const t = useTranslations('tasks.todos');
  const locale = useLocale();
  const overdue = !!todo.deadline && !todo.completed && isOverdue(todo.deadline);

  return (
    <div
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.props}
      data-todo-id={overlay ? undefined : todo.id}
      className={cn(
        'touch-draggable card-surface cursor-grab overflow-hidden rounded-xl border p-3 transition-shadow duration-200 active:cursor-grabbing sm:px-4',
        overlay && 'shadow-xl ring-1 ring-accent/40',
        highlighted && 'search-hit',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onToggle(todo);
          }}
          className={cn(
            'mt-px flex size-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-200 sm:size-6',
            'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
            todo.completed ? 'border-accent bg-accent text-accent-ink' : 'check-edge hover:border-accent hover:bg-accent-soft',
          )}
          title={todo.completed ? t('markIncomplete') : t('markComplete')}
          aria-label={todo.completed ? t('markIncomplete') : t('markComplete')}
          aria-pressed={todo.completed}
        >
          {todo.completed ? <Check size={15} strokeWidth={3} /> : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                'min-w-0 flex-1 pt-0.5 text-[15px] leading-snug font-semibold break-words',
                todo.completed ? 'card-muted line-through' : 'text-ink',
              )}
            >
              {todo.title}
            </h3>
            <div className="-mt-1 -mr-1.5 flex shrink-0 items-center">
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onEdit(todo);
                }}
                className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent sm:size-8"
                title={t('edit')}
                aria-label={t('edit')}
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  onDelete(todo);
                }}
                className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger sm:size-8"
                title={t('delete')}
                aria-label={t('delete')}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {todo.description ? (
            <Markdown className={cn('card-muted mt-1 text-sm leading-relaxed', todo.completed && 'line-through')}>{todo.description}</Markdown>
          ) : null}

          {todo.deadline ? (
            <div className="mt-2.5 flex">
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
                  overdue ? 'pill-overdue' : 'card-chip',
                )}
              >
                {overdue ? <Clock size={12} /> : <Calendar size={12} />}
                {formatDeadline(todo.deadline, locale)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A to-do in the list, dragged to another place in it. */
export function SortableTodoItem(props: Omit<TodoItemProps, 'drag' | 'overlay'>) {
  const tDrag = useTranslations('tasks.dragAndDrop');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.todo.id,
    data: { type: 'todo', todo: props.todo },
    attributes: { roleDescription: tDrag('sortable') },
  });
  return (
    <TodoItem
      {...props}
      drag={{
        ref: setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 },
        props: { ...attributes, ...listeners },
      }}
    />
  );
}
