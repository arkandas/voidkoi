'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button, Input, Modal } from '@/components/ui';
import { useApiError } from '@/lib/use-api-error';
import { LIMITS } from '@/lib/validate';

const EMPTY = { current: '', password: '', confirm: '' };

/** A new password, typed twice. With `askCurrent`, the old one first. */
export function PasswordDialog({
  open,
  title,
  askCurrent,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  askCurrent: boolean;
  onSave(current: string, password: string): Promise<void>;
  onClose(): void;
}) {
  const t = useTranslations('password');
  const tCommon = useTranslations('common');
  const apiError = useApiError();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setError(null);
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (form.password.length < LIMITS.passwordMin) return setError(t('tooShort', { min: LIMITS.passwordMin }));
    if (form.password !== form.confirm) return setError(t('mismatch'));
    setSaving(true);
    setError(null);
    try {
      await onSave(form.current, form.password);
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value })),
  });

  return (
    <Modal open={open} label={title} title={title} onClose={saving ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        {askCurrent ? <Input type="password" label={t('current')} autoComplete="current-password" autoFocus {...field('current')} /> : null}
        <Input type="password" label={t('new')} autoComplete="new-password" autoFocus={!askCurrent} {...field('password')} />
        <Input type="password" label={t('confirm')} autoComplete="new-password" {...field('confirm')} />
        {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={saving || !form.password || !form.confirm || (askCurrent && !form.current)}>
            {tCommon('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
