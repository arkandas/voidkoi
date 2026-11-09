'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { Button } from './button';
import { Modal } from './modal';

export interface ConfirmProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Red, for something that can't be undone. */
  danger?: boolean;
  onConfirm(): Promise<void> | void;
  onCancel(): void;
}

/** Ask before doing something. Stays open, with the button busy, while it happens. */
export function Confirm({ open, title, children, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmProps) {
  const t = useTranslations('common');
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} label={title} title={title} onClose={busy ? undefined : onCancel} dismissible={!busy}>
      <div className="text-ink-muted">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
          {t('cancel')}
        </Button>
        <Button
          variant={danger ? 'destructive' : 'default'}
          onClick={() => void confirm()}
          disabled={busy}
          className="w-full sm:w-auto"
          autoFocus
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
