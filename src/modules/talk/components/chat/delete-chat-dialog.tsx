'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Modal } from '@/components/ui';

export interface DeleteChatDialogProps {
  /** The other person, or the group, or null when closed. */
  name: string | null;
  /** A group you have left: there is nobody on the other side to keep a copy. */
  group?: boolean;
  deleting: boolean;
  onCancel(): void;
  onConfirm(): void;
}

/** Deleting a chat can't be undone, so it is asked once more. The other person keeps their copy. */
export function DeleteChatDialog({ name, group = false, deleting, onCancel, onConfirm }: DeleteChatDialogProps) {
  const t = useTranslations('talk.chat.deleteChat');
  const title = t(group ? 'groupTitle' : 'title', { name: name ?? '' });

  return (
    <Modal open={name !== null} onClose={deleting ? undefined : onCancel} dismissible={!deleting} label={title} title={title}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={deleting}>
          {t('cancel')}
        </Button>
        <Button variant="destructive" icon={<Trash2 size={16} />} onClick={onConfirm} disabled={deleting}>
          {deleting ? t('deleting') : t('confirm')}
        </Button>
      </div>
    </Modal>
  );
}
