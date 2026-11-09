'use client';

import { KeyRound, Trash, Upload } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { AppPicker } from '@/components/apps/app-picker';
import { useMe, useMeContext } from '@/components/me';
import { AvatarEditor } from '@/components/settings/avatar-editor';
import { PasswordDialog } from '@/components/settings/password-dialog';
import { Avatar, Button, Card, CardTitle, Input, LanguagePicker, ThemePicker, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import type { PreparedAvatar } from '@/lib/avatar-image';
import { useApiError } from '@/lib/use-api-error';
import { LIMITS } from '@/lib/validate';
import { isAppId } from '@/modules/registry';

function PictureCard() {
  const t = useTranslations('settings.picture');
  const me = useMe();
  const { setMe } = useMeContext();
  const toast = useToast();
  const apiError = useApiError();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (file) setPending(file);
  };

  const onCropped = async (prepared: PreparedAvatar): Promise<void> => {
    setBusy(true);
    try {
      setMe(await api.setAvatar(prepared.image));
      setPending(null);
      toast.show(t('updated'), 'success');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (): Promise<void> => {
    setBusy(true);
    try {
      setMe(await api.clearAvatar());
      toast.show(t('removed'));
    } catch (error) {
      toast.show(apiError(error, 'deleteFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <div className="mt-5 flex items-center gap-5">
        <Avatar person={me} size="lg" />
        <div className="flex flex-col items-start gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            aria-label={t('choose')}
            className="sr-only"
            onChange={onPick}
          />
          <Button icon={<Upload size={16} />} disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? t('working') : me.avatar ? t('change') : t('upload')}
          </Button>
          {me.avatar ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash size={15} />}
              disabled={busy}
              onClick={() => void onRemove()}
              className="text-ink-muted hover:bg-danger-soft hover:text-danger"
            >
              {t('remove')}
            </Button>
          ) : null}
        </div>
      </div>
      <AvatarEditor file={pending} onCancel={() => setPending(null)} onConfirm={onCropped} />
    </Card>
  );
}

function AccountCard() {
  const t = useTranslations('settings.account');
  const tRoles = useTranslations('roles');
  const tCommon = useTranslations('common');
  const tPassword = useTranslations('password');
  const me = useMe();
  const { setMe } = useMeContext();
  const toast = useToast();
  const apiError = useApiError();
  const [name, setName] = useState(me.name ?? '');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const changed = name.trim() !== (me.name ?? '');

  const saveName = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await api.saveProfile({ name: name.trim() || null });
      setMe(saved);
      setName(saved.name ?? '');
      toast.show(t('nameSaved'), 'success');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <form onSubmit={saveName} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          label={t('name')}
          placeholder={t('namePlaceholder')}
          maxLength={LIMITS.name}
          value={name}
          onChange={event => setName(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={saving || !changed}>
          {tCommon('save')}
        </Button>
      </form>
      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-ink-muted">{t('username')}</dt>
        <dd className="font-medium text-ink">{me.username}</dd>
        <dt className="text-ink-muted">{t('email')}</dt>
        <dd className="truncate font-medium text-ink">{me.email}</dd>
        <dt className="text-ink-muted">{t('role')}</dt>
        <dd className="font-medium text-ink">{tRoles(me.role)}</dd>
      </dl>
      {me.authMode === 'local' ? (
        <Button variant="outline" icon={<KeyRound size={16} />} onClick={() => setChangingPassword(true)} className="mt-5">
          {tPassword('change')}
        </Button>
      ) : null}
      <PasswordDialog
        open={changingPassword}
        title={tPassword('change')}
        askCurrent
        onClose={() => setChangingPassword(false)}
        onSave={async (current, password) => {
          await api.changePassword(current, password);
          // The change ended every session, this one too: sign this one back in.
          await signIn('credentials', { username: me.username, password, redirect: false });
          setChangingPassword(false);
          toast.show(tPassword('changed'), 'success');
        }}
      />
    </Card>
  );
}

function AppsCard() {
  const t = useTranslations('settings.apps');
  const me = useMe();
  const { setMe } = useMeContext();
  const toast = useToast();
  const apiError = useApiError();
  const [apps, setApps] = useState(me.apps);
  const [saving, setSaving] = useState(false);
  const changed = [...apps].sort().join() !== [...me.apps].sort().join();

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await api.saveApps(apps);
      setMe(saved);
      setApps(saved.apps);
      toast.show(t('saved'), 'success');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <div className="mt-4">
        <AppPicker value={apps} onChange={setApps} disabled={saving} />
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={saving || !changed || !apps.some(isAppId)}>
          {t('save')}
        </Button>
      </div>
    </Card>
  );
}

/** The settings every app shares: who you are, your apps, how it looks and what language it speaks. */
export default function GeneralSettingsPage() {
  const t = useTranslations('settings');
  return (
    <>
      <PictureCard />
      <AccountCard />
      <AppsCard />
      <Card>
        <CardTitle>{t('appearance')}</CardTitle>
        <div className="mt-4 max-w-xs">
          <ThemePicker />
        </div>
      </Card>
      <Card>
        <CardTitle>{t('language')}</CardTitle>
        <div className="mt-4 max-w-xs">
          <LanguagePicker />
        </div>
      </Card>
      <p className="px-1 text-xs text-ink-faint">{t('version', { version: process.env.APP_VERSION ?? '' })}</p>
    </>
  );
}
