'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Clock, Edit2, GripVertical, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties, HTMLAttributes, Ref } from 'react';

import { cn } from '@/lib/cn';
import { Markdown } from '@/modules/tasks/components/markdown';
import type { TaskDto } from '@/modules/tasks/lib/api-types';
import { formatDeadline, isOverdue } from '@/modules/tasks/lib/deadline';

interface TaskCardProps {
  task: TaskDto;
  onDelete(task: TaskDto): void;
  onEdit(task: TaskDto): void;
  /** Drawn under the pointer while it is dragged. */
  overlay?: boolean;
  highlighted?: boolean;
  /** What makes it draggable, from SortableTaskCard. */
  drag?: { ref: Ref<HTMLDivElement>; style: CSSProperties; props: HTMLAttributes<HTMLDivElement> };
}

/** A task on a board: its title, notes, priority and deadline. */
export function TaskCard({ task, onDelete, onEdit, overlay = false, highlighted = false, drag }: TaskCardProps) {
  const t = useTranslations('tasks.task');
  const tPriority = useTranslations('tasks.priority');
  const locale = useLocale();
  const overdue = !!task.deadline && !task.completed && isOverdue(task.deadline);
  const priority = task.priority.toLowerCase() as 'low' | 'medium' | 'high' | 'urgent';

  return (
    <div
      ref={drag?.ref}
      style={drag?.style}
      {...drag?.props}
      data-task-id={overlay ? undefined : task.id}
      className={cn(
        `touch-draggable priority-${priority} card-surface cursor-grab overflow-hidden rounded-xl border p-3 transition-shadow duration-200 active:cursor-grabbing`,
        overlay && 'shadow-xl ring-1 ring-accent/40',
        task.completed && 'opacity-70',
        highlighted && 'search-hit',
      )}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-1">
          <GripVertical size={16} aria-hidden="true" className="mt-0.5 -ml-1 shrink-0 text-ink-faint sm:hidden" />
          <h3 className={cn('min-w-0 flex-1 text-sm leading-snug font-semibold break-words text-ink', task.completed && 'line-through')}>
            {task.title}
          </h3>
          <div className="-mt-1.5 -mr-1.5 flex shrink-0 items-center">
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onEdit(task);
              }}
              className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-accent sm:size-7"
              title={t('edit')}
              aria-label={t('edit')}
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onDelete(task);
              }}
              className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger sm:size-7"
              title={t('delete')}
              aria-label={t('delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {task.description ? <Markdown className="card-muted text-[13px] leading-relaxed">{task.description}</Markdown> : null}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-0.5">
          <span className="priority-chip rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold">{tPriority(priority)}</span>

          {task.deadline ? (
            <span
              className={cn(
                'flex items-center gap-1',
                overdue ? 'pill-overdue rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold' : 'card-muted text-xs font-medium',
              )}
            >
              <Calendar size={12} />
              {formatDeadline(task.deadline, locale)}
              {overdue ? <Clock size={12} /> : null}
            </span>
          ) : null}

        </div>
      </div>
    </div>
  );
}

/** A task in its section, dragged to another place or another section. */
export function SortableTaskCard(props: Omit<TaskCardProps, 'drag' | 'overlay'>) {
  const tDrag = useTranslations('tasks.dragAndDrop');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    data: { type: 'task', task: props.task },
    attributes: { roleDescription: tDrag('sortable') },
  });
  return (
    <TaskCard
      {...props}
      drag={{
        ref: setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 },
        props: { ...attributes, ...listeners },
      }}
    />
  );
}
