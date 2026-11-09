'use client';

import { QrCode } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { CopyField, DatePicker, IconButton, PasswordSetting, Switch } from '@/components/ui';
import { addDays, addMonths, dayKey } from '@/lib/days';

/** Something to fix in a link's form before it can be saved, already in the reader's words. */
export class Problem extends Error {}

/** A link set to expire on a day works until that day ends. */
export function endOfDay(day: string): string {
  return new Date(`${day}T23:59:59`).toISOString();
}

export function inAWeek(): string {
  return addDays(dayKey(new Date()), 7);
}

/** What both kinds of link can have: a password and an expiry date. */
export interface LockDraft {
  usePassword: boolean;
  password: string;
  changingPassword: boolean;
  useExpiry: boolean;
  expiry: string;
}

export function lockDraftFrom(link: { hasPassword: boolean; expiresAt: string | null } | null): LockDraft {
  return {
    usePassword: link?.hasPassword ?? false,
    password: '',
    changingPassword: false,
    useExpiry: !!link?.expiresAt,
    expiry: link?.expiresAt ? dayKey(new Date(link.expiresAt)) : inAWeek(),
  };
}

/** Whether the password or the expiry date differ from what is saved. */
export function lockChanged(draft: LockDraft, saved: LockDraft): boolean {
  return (
    draft.usePassword !== saved.usePassword ||
    (draft.usePassword && draft.password !== '') ||
    draft.useExpiry !== saved.useExpiry ||
    (draft.useExpiry && draft.expiry !== saved.expiry)
  );
}

/** The password and expiry date to send. Throws a Problem when a password is turned on but not typed. */
export function lockChanges(draft: LockDraft, hasPassword: boolean, missing: string): { password?: string | null; expiresAt: string | null } {
  if (draft.usePassword && !hasPassword && !draft.password) throw new Problem(missing);
  const changes: { password?: string | null; expiresAt: string | null } = { expiresAt: draft.useExpiry ? endOfDay(draft.expiry) : null };
  if (!draft.usePassword) changes.password = null;
  else if (draft.password) changes.password = draft.password;
  return changes;
}

/** A link's address, with Copy and its QR code. */
export function LinkAddress({ url, label, onQr }: { url: string; label: string; onQr(): void }) {
  const t = useTranslations('files.share');
  return (
    <CopyField value={url} label={label}>
      <IconButton variant="outline" label={t('qr')} icon={<QrCode size={18} />} onClick={onQr} />
    </CopyField>
  );
}

/** The password and expiry switches of a link, with their fields. */
export function LockSettings({
  draft,
  hasPassword,
  update,
}: {
  draft: LockDraft;
  /** The saved link has one. */
  hasPassword: boolean;
  update(changes: Partial<LockDraft>): void;
}) {
  const t = useTranslations('files.share');
  const locale = useLocale();
  const today = dayKey(new Date());
  const span = (count: number, unit: 'day' | 'week' | 'month') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(count);
  const presets = [
    { label: span(1, 'day'), value: addDays(today, 1) },
    { label: span(1, 'week'), value: addDays(today, 7) },
    { label: span(1, 'month'), value: addMonths(today, 1) },
    { label: span(3, 'month'), value: addMonths(today, 3) },
  ];

  return (
    <>
      <Switch
        label={t('password')}
        checked={draft.usePassword}
        onChange={checked => update({ usePassword: checked, password: '', changingPassword: false })}
      />
      {draft.usePassword ? (
        <PasswordSetting
          hasPassword={hasPassword}
          changing={draft.changingPassword}
          onChanging={() => update({ changingPassword: true })}
          value={draft.password}
          onValue={password => update({ password })}
          label={t('passwordNew')}
        />
      ) : null}

      <div className="h-px bg-line" />

      <Switch label={t('expiry')} checked={draft.useExpiry} onChange={checked => update({ useExpiry: checked })} />
      {draft.useExpiry ? (
        <DatePicker label={t('expiry')} value={draft.expiry} min={today} presets={presets} onChange={expiry => update({ expiry })} />
      ) : null}
    </>
  );
}
