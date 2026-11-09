'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, Input, Modal } from '@/components/ui';
import { splitExtension } from '@/modules/files/lib/names';
import { useApiError } from '@/lib/use-api-error';

export interface NameDialogProps {
  open: boolean;
  title: string;
  label: string;
  submitLabel: string;
  /** The current name, when renaming. */
  initial?: string;
  /** Keep the extension out of the first selection, so typing replaces just the name. */
  isFile?: boolean;
  onSubmit(name: string): Promise<void>;
  onClose(): void;
}

/** Name a new folder, or rename something. */
export function NameDialog({ open, title, label, submitLabel, initial = '', isFile = false, onSubmit, onClose }: NameDialogProps) {
  const t = useTranslations('common');
  const apiError = useApiError();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState({ open, initial, isFile });

  // Opened, or opened for something else: start from its name.
  if (shown.open !== open || shown.initial !== initial || shown.isFile !== isFile) {
    setShown({ open, initial, isFile });
    if (open) {
      setName(initial);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const end = isFile ? splitExtension(initial)[0].length : initial.length;
      input.setSelectionRange(0, end || initial.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initial, isFile]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === initial) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} label={title} title={title} onClose={busy ? undefined : onClose} dismissible={!busy}>
      <form onSubmit={submit} noValidate>
        <Input
          ref={inputRef}
          label={label}
          value={name}
          maxLength={255}
          onChange={event => setName(event.target.value)}
          error={error}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy || !name.trim()} className="w-full sm:w-auto">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
