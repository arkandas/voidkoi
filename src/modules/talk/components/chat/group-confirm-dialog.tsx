'use client';

import { LogOut, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Modal } from '@/components/ui';

export type GroupConfirmAction = 'leave' | 'delete';

export interface GroupConfirmDialogProps {
  /** What is being asked about, or null when closed. */
  action: GroupConfirmAction | null;
  name: string;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}

/** Leaving and deleting are both asked once more. */
export function GroupConfirmDialog({ action, name, busy, onCancel, onConfirm }: GroupConfirmDialogProps) {
  const t = useTranslations('talk.chat.group');
  const key = action ?? 'leave';
  const title = t(`${key}.title`, { name });

  return (
    <Modal open={action !== null} onClose={busy ? undefined : onCancel} dismissible={!busy} label={title} title={title}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          {t(`${key}.cancel`)}
        </Button>
        <Button variant="destructive" icon={key === 'leave' ? <LogOut size={16} /> : <Trash2 size={16} />} onClick={onConfirm} disabled={busy}>
          {key === 'leave' ? (busy ? t('leave.leaving') : t('leave.confirm')) : busy ? t('delete.deleting') : t('delete.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
