'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SectionWithTasks, TaskDto } from '@/modules/tasks/lib/api-types';

import { SortableTaskCard } from './task-card';

interface SectionColumnProps {
  section: SectionWithTasks;
  widthClass: string;
  onRename(id: number, title: string): Promise<void>;
  onDelete(section: SectionWithTasks): void;
  onAddTask(sectionId: number): void;
  onEditTask(task: TaskDto): void;
  onDeleteTask(task: TaskDto): void;
  /** A task is being dragged over it. */
  draggedOver?: boolean;
  highlightTaskId?: number | null;
}

/** A section of a board: its title, which renames on a click, and its tasks, which take drops. */
export function SectionColumn({
  section,
  widthClass,
  onRename,
  onDelete,
  onAddTask,
  onEditTask,
  onDeleteTask,
  draggedOver = false,
  highlightTaskId = null,
}: SectionColumnProps) {
  const t = useTranslations('tasks.section');
  const tCommon = useTranslations('common');
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(section.title);
  const { setNodeRef, isOver } = useDroppable({ id: `section-${section.id}`, data: { type: 'section', section } });

  const rename = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === section.title) {
      setTitle(section.title);
      setRenaming(false);
      return;
    }
    try {
      await onRename(section.id, trimmed);
      setRenaming(false);
    } catch {
      setTitle(section.title);
    }
  };

  const cancel = (): void => {
    setTitle(section.title);
    setRenaming(false);
  };

  const dropTarget = draggedOver || isOver;

  return (
    <div
      ref={setNodeRef}
      data-section-id={section.id}
      className={cn(
        'section-col flex h-full shrink-0 flex-col rounded-xl border transition-colors duration-200 sm:h-auto',
        widthClass,
        dropTarget ? 'border-accent bg-accent-soft ring-2 ring-accent/25' : 'border-line bg-canvas',
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pt-2 pr-1.5 pb-0.5 pl-3">
        {renaming ? (
          <div className="flex flex-1 items-center gap-2 py-0.5">
            <Input
              size="sm"
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void rename();
                if (event.key === 'Escape') cancel();
              }}
              aria-label={t('titleLabel')}
              maxLength={200}
              className="px-2.5"
              autoFocus
            />
            <Button size="sm" onClick={() => void rename()}>
              {tCommon('save')}
            </Button>
          </div>
        ) : (
          <>
            <h2 className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className="min-w-0 truncate text-sm font-bold text-ink transition-colors hover:text-accent"
                onClick={() => {
                  setTitle(section.title);
                  setRenaming(true);
                }}
                title={t('rename', { title: section.title })}
              >
                {section.title}
              </button>
              <span className="min-w-5 shrink-0 rounded-full bg-muted px-1.5 text-center text-[11px] leading-5 font-semibold text-ink-muted tabular-nums">
                {section.tasks.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => onDelete(section)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger sm:size-8"
              title={t('delete')}
              aria-label={t('delete')}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:min-h-[180px]">
        <div className="themed-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-2.5 pt-1.5 pb-1 sm:overflow-visible">
          <SortableContext items={section.tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
            {section.tasks.map(task => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onDelete={onDeleteTask}
                onEdit={onEditTask}
                highlighted={highlightTaskId === task.id}
              />
            ))}
          </SortableContext>

          {section.tasks.length === 0 ? (
            <div
              className={cn(
                'flex min-h-[110px] items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium transition-colors duration-200',
                dropTarget ? 'border-accent text-accent' : 'border-line-strong text-ink-faint',
              )}
            >
              {t('dropHere')}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 px-2.5 pt-1.5 pb-2.5">
          <button
            type="button"
            onClick={() => onAddTask(section.id)}
            className="flex h-11 w-full items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink sm:h-9"
          >
            <Plus size={16} />
            {t('addTask')}
          </button>
        </div>
      </div>
    </div>
  );
}
