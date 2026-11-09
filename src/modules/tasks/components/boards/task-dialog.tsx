'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useFocusOnOpen } from '@/modules/tasks/components/use-focus-on-open';
import type { ItemInput } from '@/modules/tasks/lib/api';
import { PRIORITIES, type Priority, type SectionWithTasks, type TaskDto } from '@/modules/tasks/lib/api-types';
import { deadlineDay } from '@/modules/tasks/lib/deadline';

export type TaskDialogState = { mode: 'create'; sectionId: number } | { mode: 'edit'; task: TaskDto } | null;

interface TaskDialogProps {
  state: TaskDialogState;
  sections: SectionWithTasks[];
  onClose(): void;
  /** Saves the task, into `sectionId`. Throws when it can't. */
  onSave(input: ItemInput, sectionId: number): Promise<void>;
}

/** A new task, or one being edited: title, Markdown notes, priority and deadline. */
export function TaskDialog({ state, sections, onClose, onSave }: TaskDialogProps) {
  const t = useTranslations('tasks.task');
  const tPriority = useTranslations('tasks.priority');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<TaskDialogState>(null);
  const titleRef = useFocusOnOpen<HTMLInputElement>(state !== null);

  // Opened on a task, or for a new one: start from what it has.
  if (shown !== state) {
    setShown(state);
    if (state) {
      const task = state.mode === 'edit' ? state.task : null;
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setPriority(task?.priority ?? 'MEDIUM');
      setDeadline(deadlineDay(task?.deadline ?? null));
      setSectionId(task ? task.sectionId : state.mode === 'create' ? state.sectionId : null);
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || saving || sectionId === null) return;
    setSaving(true);
    try {
      const trimmed = description.trim();
      await onSave({ title, description: trimmed === '' ? null : trimmed, priority, deadline }, sectionId);
    } catch {
      // The board says what went wrong; the dialog stays open to try again.
    } finally {
      setSaving(false);
    }
  };

  const editing = state?.mode === 'edit' ? state.task : null;
  const heading = editing ? t('editTitle') : t('createTitle');

  return (
    <Modal open={state !== null} size="lg" label={heading} title={heading} onClose={onClose} dismissible={!saving}>
      <form onSubmit={event => void submit(event)} className="space-y-4">
        <Input
          ref={titleRef}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('titlePlaceholder')}
          aria-label={t('titleLabel')}
          maxLength={100}
          required
        />
        <Textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('descriptionPlaceholder')}
          aria-label={t('descriptionLabel')}
          rows={6}
          maxLength={1000}
          className="h-28 sm:h-auto"
        />
        {editing && sections.length > 1 ? (
          <div className="sm:hidden">
            <Select
              label={t('section')}
              value={String(sectionId ?? '')}
              onChange={event => setSectionId(Number(event.target.value))}
              options={sections.map(section => ({ value: String(section.id), label: section.title }))}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={t('priority')}
            value={priority}
            onChange={event => setPriority(event.target.value as Priority)}
            options={PRIORITIES.map(value => ({ value, label: tPriority(value.toLowerCase() as 'low' | 'medium' | 'high' | 'urgent') }))}
          />
          <Input
            label={t('deadline')}
            type="date"
            value={deadline ?? ''}
            onChange={event => setDeadline(event.target.value || null)}
            className={deadline ? undefined : 'text-ink-faint'}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={!title.trim() || saving} className="w-full sm:w-auto">
            {editing ? t('saveChanges') : t('create')}
          </Button>
        </div>
      </form>

    </Modal>
  );
}
