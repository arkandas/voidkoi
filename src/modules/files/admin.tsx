'use client';

import { HardDrive } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { Avatar, Button, Card, CardTitle, Modal, Segmented, Spinner, Switch, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useApiError } from '@/lib/use-api-error';
import { SizeInput } from '@/modules/files/components/size-input';
import { api } from '@/modules/files/lib/api';
import type { SettingsDto, StorageUser } from '@/modules/files/lib/api-types';

const TEN_GB = 10 * 1024 ** 3;

function LimitsCard({ settings, onSaved }: { settings: SettingsDto; onSaved(settings: SettingsDto): void }) {
  const t = useTranslations('files.admin.limits');
  const toast = useToast();
  const apiError = useApiError();
  const [maxUpload, setMaxUpload] = useState<number | null>(settings.maxUploadBytes);
  const [limitUpload, setLimitUpload] = useState(settings.maxUploadBytes !== null);
  const [quota, setQuota] = useState<number | null>(settings.defaultQuotaBytes);
  const [limitQuota, setLimitQuota] = useState(settings.defaultQuotaBytes !== null);
  const [linkFolder, setLinkFolder] = useState<number | null>(settings.uploadLinkMaxBytes);
  const [limitLinkFolder, setLimitLinkFolder] = useState(settings.uploadLinkMaxBytes !== null);
  const [saving, setSaving] = useState(false);

  const next: SettingsDto = {
    maxUploadBytes: limitUpload ? maxUpload : null,
    defaultQuotaBytes: limitQuota ? quota : null,
    uploadLinkMaxBytes: limitLinkFolder ? linkFolder : null,
  };
  const invalid = (limitUpload && maxUpload === null) || (limitQuota && quota === null) || (limitLinkFolder && linkFolder === null);
  const changed =
    next.maxUploadBytes !== settings.maxUploadBytes ||
    next.defaultQuotaBytes !== settings.defaultQuotaBytes ||
    next.uploadLinkMaxBytes !== settings.uploadLinkMaxBytes;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      onSaved(await api.saveSettings(next));
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
      <div className="mt-5 space-y-5">
        <div className="space-y-3">
          <Switch
            label={t('upload')}
            checked={limitUpload}
            onChange={checked => {
              setLimitUpload(checked);
              if (checked && maxUpload === null) setMaxUpload(TEN_GB);
            }}
          />
          {limitUpload ? <SizeInput label={t('upload')} bytes={maxUpload} onChange={setMaxUpload} /> : null}
        </div>
        <div className="h-px bg-line" />
        <div className="space-y-3">
          <Switch
            label={t('quota')}
            checked={limitQuota}
            onChange={checked => {
              setLimitQuota(checked);
              if (checked && quota === null) setQuota(5 * TEN_GB);
            }}
          />
          {limitQuota ? <SizeInput label={t('quota')} bytes={quota} onChange={setQuota} /> : null}
        </div>
        <div className="h-px bg-line" />
        <div className="space-y-3">
          <Switch
            label={t('uploadLink')}
            checked={limitLinkFolder}
            onChange={checked => {
              setLimitLinkFolder(checked);
              if (checked && linkFolder === null) setLinkFolder(TEN_GB);
            }}
          />
          {limitLinkFolder ? <SizeInput label={t('uploadLink')} bytes={linkFolder} onChange={setLinkFolder} /> : null}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || invalid || !changed}>
            {t('save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function QuotaDialog({
  user,
  settings,
  onClose,
  onSaved,
}: {
  user: StorageUser | null;
  settings: SettingsDto;
  onClose(): void;
  onSaved(user: StorageUser): void;
}) {
  const t = useTranslations('files.admin.quota');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const apiError = useApiError();
  const [mode, setMode] = useState<StorageUser['quotaMode']>('default');
  const [bytes, setBytes] = useState<number | null>(TEN_GB);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState<StorageUser | null>(null);

  // A different person: start from their limit.
  if (user && user !== shown) {
    setShown(user);
    setMode(user.quotaMode);
    setBytes(user.quota ?? settings.defaultQuotaBytes ?? TEN_GB);
    setError(null);
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.setQuota(user.id, mode, mode === 'custom' ? bytes : null));
      onClose();
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const title = user ? t('title', { name: user.username }) : '';
  const fallback = settings.defaultQuotaBytes === null ? t('noLimit') : formatBytes(settings.defaultQuotaBytes, locale);

  return (
    <Modal open={user !== null} label={title} title={title} onClose={saving ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented<StorageUser['quotaMode']>
          ariaLabel={t('mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'default', label: t('defaultWith', { size: fallback }) },
            { value: 'custom', label: t('custom') },
            { value: 'unlimited', label: t('unlimited') },
          ]}
        />
        {mode === 'custom' ? <SizeInput key={user?.id} label={t('custom')} bytes={bytes} onChange={setBytes} /> : null}
        {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={saving || (mode === 'custom' && bytes === null)}>
            {tCommon('save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Files in Admin: the limits on uploads and storage, and what each person stores. */
export default function FilesAdmin() {
  const t = useTranslations('files.admin.storage');
  const locale = useLocale();
  const toast = useToast();
  const apiError = useApiError();
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [users, setUsers] = useState<StorageUser[] | null>(null);
  const [editing, setEditing] = useState<StorageUser | null>(null);

  // The limits and the people are set once the answer is back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.settings(), api.storage()]).then(
      ([loadedSettings, loadedUsers]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setUsers(loadedUsers);
      },
      (error: unknown) => {
        if (!cancelled) toast.show(apiError(error, 'loadFailed'), 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [toast, apiError]);

  if (!settings || !users) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const limitOf = (user: StorageUser): number | null =>
    user.quotaMode === 'default' ? settings.defaultQuotaBytes : user.quotaMode === 'custom' ? user.quota : null;

  return (
    <div className="space-y-4">
      <LimitsCard settings={settings} onSaved={setSettings} />
      <Card>
        <CardTitle>{t('title')}</CardTitle>
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {users.map(user => {
            const limit = limitOf(user);
            const fraction = limit ? Math.min(1, user.usage / limit) : null;
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
                <Avatar person={user} size="md" />
                <p className="min-w-0 flex-1 truncate font-semibold text-ink">{user.username}</p>
                <div className="w-full sm:w-52">
                  <p className="text-sm text-ink-muted tabular-nums">
                    {limit !== null
                      ? t('usedOf', { used: formatBytes(user.usage, locale), limit: formatBytes(limit, locale) })
                      : t('used', { used: formatBytes(user.usage, locale) })}
                  </p>
                  {fraction !== null ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', fraction > 0.9 ? 'bg-danger' : 'bg-accent')}
                        style={{ width: `${Math.max(fraction > 0 ? 2 : 0, fraction * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-faint">{t(`mode.${user.quotaMode}`)}</p>
                </div>
                <Button size="sm" variant="outline" icon={<HardDrive size={15} />} onClick={() => setEditing(user)}>
                  {t('edit')}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <QuotaDialog
        user={editing}
        settings={settings}
        onClose={() => setEditing(null)}
        onSaved={user => setUsers(current => current?.map(other => (other.id === user.id ? user : other)) ?? null)}
      />
    </div>
  );
}
