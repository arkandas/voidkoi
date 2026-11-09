'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, Input, Modal, Textarea } from '@/components/ui';
import { useFocusOnOpen } from '@/modules/tasks/components/use-focus-on-open';
import type { ItemInput } from '@/modules/tasks/lib/api';
import type { TodoDto } from '@/modules/tasks/lib/api-types';
import { deadlineDay } from '@/modules/tasks/lib/deadline';

interface TodoDialogProps {
  open: boolean;
  /** The item being edited, or null for a new one. */
  todo: TodoDto | null;
  onClose(): void;
  onSave(input: ItemInput): Promise<void>;
}

/** A new to-do, or changes to one: its title, notes and deadline. */
export function TodoDialog({ open, todo, onClose, onSave }: TodoDialogProps) {
  const t = useTranslations('tasks.todos');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<{ open: boolean; todo: TodoDto | null }>({ open: false, todo: null });
  const titleRef = useFocusOnOpen<HTMLInputElement>(open);

  // Opened, or opened on another item: start from what it has.
  if (shown.open !== open || shown.todo !== todo) {
    setShown({ open, todo });
    if (open) {
      setTitle(todo?.title ?? '');
      setDescription(todo?.description ?? '');
      setDeadline(deadlineDay(todo?.deadline ?? null));
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const trimmed = description.trim();
      await onSave({ title, description: trimmed === '' ? null : trimmed, deadline });
    } finally {
      setSaving(false);
    }
  };

  const heading = todo ? t('edit') : t('new');

  return (
    <Modal open={open} label={heading} title={heading} onClose={onClose} dismissible={!saving}>
      <form onSubmit={event => void submit(event)} className="space-y-4 sm:space-y-5">
        <Input
          ref={titleRef}
          label={t('titleLabel')}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('titlePlaceholder')}
          maxLength={200}
          required
        />
        <Textarea
          label={t('descriptionLabel')}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('descriptionPlaceholder')}
          rows={3}
          maxLength={5000}
        />
        <Input
          label={t('deadlineLabel')}
          type="date"
          value={deadline ?? ''}
          onChange={event => setDeadline(event.target.value || null)}
          className={deadline ? undefined : 'text-ink-faint'}
        />
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={!title.trim() || saving} className="w-full sm:w-auto">
            {todo ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
