'use client';

import { Globe, KeyRound, Lock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { Avatar, Button, Card, CardTitle, EmptyState, Input, PasswordSetting, Select, Spinner, Switch, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useApiError } from '@/lib/use-api-error';
import { api } from '@/modules/wiki/lib/api';
import type { EffectiveVisibility, WikiAdminSettingsDto, WikiMemberDto } from '@/modules/wiki/lib/api-types';
import { LIMITS } from '@/modules/wiki/lib/validate';

const VISIBILITY_ICONS: Record<EffectiveVisibility, typeof Globe> = { public: Globe, private: Lock, password: KeyRound };

function SettingsCard({ settings: initial }: { settings: WikiAdminSettingsDto }) {
  const t = useTranslations('wiki.admin.wiki');
  const tVisibility = useTranslations('wiki.visibility');
  const toast = useToast();
  const apiError = useApiError();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [homePageId, setHomePageId] = useState<number | null>(initial.homePageId);
  const [visibility, setVisibility] = useState<EffectiveVisibility>(initial.rootVisibility);
  const [password, setPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [allowIndexing, setAllowIndexing] = useState(initial.allowIndexing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPassword = saved.rootVisibility === 'password' && saved.hasRootPassword;
  const needsPassword = visibility === 'password' && (!hasPassword || changingPassword);
  const changed =
    name.trim() !== saved.name ||
    homePageId !== saved.homePageId ||
    visibility !== saved.rootVisibility ||
    allowIndexing !== saved.allowIndexing ||
    password !== '';

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (needsPassword && !password) {
      setError(t('passwordMissing'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await api.saveSettings({
        name: name.trim(),
        homePageId,
        rootVisibility: visibility,
        ...(password ? { password } : {}),
        allowIndexing,
      });
      setSaved(current => ({ ...current, ...next }));
      setPassword('');
      setChangingPassword(false);
      toast.show(t('saved'), 'success');
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <form onSubmit={save} className="mt-5 space-y-5">
        <Input label={t('name')} value={name} maxLength={LIMITS.wikiName} onChange={event => setName(event.target.value)} />
        <Select
          label={t('home')}
          value={homePageId === null ? '' : String(homePageId)}
          onChange={event => setHomePageId(event.target.value ? Number(event.target.value) : null)}
          options={[{ value: '', label: t('homeIndex') }, ...saved.pages.map(page => ({ value: String(page.id), label: page.label }))]}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">{t('visibility')}</p>
          <div role="radiogroup" aria-label={t('visibility')} className="grid gap-2 sm:grid-cols-3">
            {(['public', 'private', 'password'] as const).map(option => {
              const Icon = VISIBILITY_ICONS[option];
              const selected = visibility === option;
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/25',
                    selected ? 'border-accent bg-accent-soft text-ink' : 'border-line-strong text-ink hover:bg-muted',
                  )}
                >
                  <input type="radio" name="root-visibility" value={option} checked={selected} onChange={() => setVisibility(option)} className="sr-only" />
                  <Icon size={17} aria-hidden="true" className={option === 'public' ? 'text-success' : option === 'password' ? 'text-warning' : 'text-ink-muted'} />
                  {tVisibility(option)}
                </label>
              );
            })}
          </div>
          {visibility === 'password' ? (
            <PasswordSetting
              className="mt-3"
              hasPassword={hasPassword}
              changing={changingPassword}
              onChanging={() => setChangingPassword(true)}
              value={password}
              onValue={setPassword}
              label={t('passwordNew')}
              maxLength={LIMITS.password}
            />
          ) : null}
        </div>
        <div className="h-px bg-line" />
        <Switch label={t('indexing')} checked={allowIndexing} onChange={setAllowIndexing} />
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !changed || !name.trim()}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditorsCard({ members: initial }: { members: WikiMemberDto[] }) {
  const t = useTranslations('wiki.admin.editors');
  const toast = useToast();
  const apiError = useApiError();
  const [members, setMembers] = useState(initial);
  const [saving, setSaving] = useState<number | null>(null);

  const setEditor = async (member: WikiMemberDto, editor: boolean): Promise<void> => {
    setSaving(member.id);
    try {
      const saved = await api.setEditor(member.id, editor);
      setMembers(current => current.map(other => (other.id === saved.id ? saved : other)));
      const name = saved.name ?? saved.username;
      toast.show(saved.editor ? t('on', { name }) : t('off', { name }), 'success');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      {members.length === 0 ? (
        <EmptyState className="py-10" icon={<Users size={24} />} title={t('nobody')} />
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {members.map(member => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <Avatar person={member} size="md" />
              <Switch
                className="min-w-0 flex-1 items-center"
                label={member.name ?? member.username}
                description={member.admin ? t('admin') : member.name ? member.username : undefined}
                checked={member.editor}
                disabled={member.admin || saving === member.id}
                onChange={editor => void setEditor(member, editor)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The wiki in Admin: its name, its start page, who can read it, and who can edit it. */
export default function WikiAdmin() {
  const toast = useToast();
  const apiError = useApiError();
  const [settings, setSettings] = useState<WikiAdminSettingsDto | null>(null);
  const [members, setMembers] = useState<WikiMemberDto[] | null>(null);

  // Set once the answers are back, not while the effect runs.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.settings(), api.members()]).then(
      ([loadedSettings, loadedMembers]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setMembers(loadedMembers);
      },
      (error: unknown) => {
        if (!cancelled) toast.show(apiError(error, 'loadFailed'), 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [toast, apiError]);

  if (!settings || !members) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsCard settings={settings} />
      <EditorsCard members={members} />
    </div>
  );
}
