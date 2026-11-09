'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, Input, Modal, Textarea } from '@/components/ui';
import { useFocusOnOpen } from '@/modules/tasks/components/use-focus-on-open';
import type { BoardInput } from '@/modules/tasks/lib/api';
import type { BoardDto } from '@/modules/tasks/lib/api-types';

/** A new board: its title and, if wanted, what it is for. */
export function CreateBoardDialog({ open, onClose, onCreate }: { open: boolean; onClose(): void; onCreate(board: BoardInput): Promise<void> }) {
  const t = useTranslations('tasks.boards.create');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const titleRef = useFocusOnOpen<HTMLInputElement>(open);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle('');
      setDescription('');
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate({ title, description: description.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} label={t('title')} title={t('title')} onClose={onClose} dismissible={!saving}>
      <form onSubmit={event => void submit(event)} className="space-y-4 sm:space-y-5">
        <Input
          ref={titleRef}
          label={t('titleLabel')}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('titlePlaceholder')}
          maxLength={200}
        />
        <Textarea
          label={t('descriptionLabel')}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('descriptionPlaceholder')}
          rows={3}
          maxLength={5000}
        />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3 sm:pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={!title.trim() || saving} className="w-full sm:w-auto">
            {t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface EditBoardDialogProps {
  board: BoardDto | null;
  onClose(): void;
  onSave(changes: BoardInput): Promise<void>;
  onDelete(): void;
}

/** A board's title and description, and the way to delete it. */
export function EditBoardDialog({ board, onClose, onSave, onDelete }: EditBoardDialogProps) {
  const t = useTranslations('tasks.board');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<BoardDto | null>(null);
  const titleRef = useFocusOnOpen<HTMLInputElement>(board !== null);

  if (shown !== board) {
    setShown(board);
    if (board) {
      setTitle(board.title);
      setDescription(board.description ?? '');
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!board || !title.trim() || saving) return;
    if (title.trim() === board.title && description.trim() === (board.description ?? '')) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: description.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={board !== null} label={t('editTitle')} title={t('editTitle')} onClose={onClose} dismissible={!saving}>
      <form onSubmit={event => void submit(event)} className="space-y-4">
        <Input
          ref={titleRef}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('titlePlaceholder')}
          aria-label={t('titleLabel')}
          maxLength={200}
        />
        <Textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={t('descriptionPlaceholder')}
          aria-label={t('descriptionLabel')}
          rows={2}
          maxLength={5000}
        />
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row-reverse sm:justify-between sm:gap-2">
          <Button variant="destructive" onClick={onDelete} disabled={saving} className="w-full sm:w-auto">
            {t('delete')}
          </Button>
          <div className="flex gap-2">
            <Button type="submit" disabled={!title.trim() || saving} className="flex-1 sm:flex-none">
              {tCommon('save')}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
