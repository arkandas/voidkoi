'use client';

import { KeyRound, ShieldCheck, ShieldOff, Trash, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { useMe } from '@/components/me';
import { PasswordDialog } from '@/components/settings/password-dialog';
import { Avatar, Badge, Button, Card, CardTitle, Confirm, IconButton, Input, Modal, Select, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import type { AdminUser } from '@/lib/api-types';
import { useApiError } from '@/lib/use-api-error';
import { LIMITS } from '@/lib/validate';
import { APPS } from '@/modules/registry';

function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose(): void; onCreated(user: AdminUser): void }) {
  const t = useTranslations('admin.add');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const apiError = useApiError();
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'USER' as 'USER' | 'ADMIN' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Opened again: an empty form.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm({ username: '', email: '', password: '', role: 'USER' });
      setError(null);
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createUser(form));
      onClose();
    } catch (caught) {
      setError(apiError(caught, 'createUserFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} label={t('title')} title={t('title')} onClose={saving ? undefined : onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('username')} autoCapitalize="none" spellCheck={false} maxLength={LIMITS.username} value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} />
        <Input label={t('email')} type="email" maxLength={LIMITS.email} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
        <Input
          label={t('password')}
          type="password"
          autoComplete="new-password"
          placeholder={t('passwordHint', { min: LIMITS.passwordMin })}
          value={form.password}
          onChange={event => setForm({ ...form, password: event.target.value })}
        />
        <Select
          label={t('role')}
          value={form.role}
          onChange={event => setForm({ ...form, role: event.target.value as 'USER' | 'ADMIN' })}
          options={[
            { value: 'USER', label: tRoles('USER') },
            { value: 'ADMIN', label: tRoles('ADMIN') },
          ]}
        />
        {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={saving || !form.username || !form.email || !form.password}>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Admin's first page: everyone with an account, what they use, and what can be done with each. */
export default function PeoplePage() {
  const t = useTranslations('admin');
  const tRoles = useTranslations('roles');
  const tApps = useTranslations();
  const tPassword = useTranslations('password');
  const me = useMe();
  const toast = useToast();
  const apiError = useApiError();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const local = me.authMode === 'local';

  useEffect(() => {
    let cancelled = false;
    api.users().then(
      found => {
        if (!cancelled) setUsers(found);
      },
      (error: unknown) => {
        if (!cancelled) toast.show(apiError(error, 'loadFailed'), 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [toast, apiError]);

  const replace = (user: AdminUser) => setUsers(current => current?.map(other => (other.id === user.id ? user : other)) ?? null);

  const setRole = async (user: AdminUser): Promise<void> => {
    const role = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      replace(await api.setRole(user.id, role));
      toast.show(t('users.roleChanged', { name: user.username, role: tRoles(role) }), 'success');
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error');
    }
  };

  const deleteUser = async (user: AdminUser): Promise<void> => {
    try {
      await api.deleteUser(user.id);
      setUsers(current => current?.filter(other => other.id !== user.id) ?? null);
      setDeleting(null);
      toast.show(t('users.deleted', { name: user.username }), 'success');
    } catch (error) {
      toast.show(apiError(error, 'deleteUserFailed'), 'error');
    }
  };

  if (!users) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('users.title')}</CardTitle>
          {local ? (
            <Button icon={<UserPlus size={16} />} onClick={() => setAdding(true)}>
              {t('users.add')}
            </Button>
          ) : null}
        </div>

        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {users.map(user => {
            const own = user.id === me.id;
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-4">
                <Avatar person={user} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold text-ink">
                    {user.name ?? user.username}
                    {user.role === 'ADMIN' ? <Badge tone="neutral">{tRoles('ADMIN')}</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-ink-muted">{user.name ? `${user.username} · ${user.email}` : user.email}</p>
                </div>
                <ul aria-label={tApps('apps.label')} className="flex items-center gap-1">
                  {APPS.filter(app => user.apps.includes(app.id)).map(app => (
                    <li key={app.id} title={tApps(`${app.id}.app.name`)}>
                      <AppIcon app={app.id} size={22} className="rounded-[5px]" />
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1">
                  {!own ? (
                    <IconButton
                      label={user.role === 'ADMIN' ? t('users.makeUser') : t('users.makeAdmin')}
                      icon={user.role === 'ADMIN' ? <ShieldOff size={17} /> : <ShieldCheck size={17} />}
                      onClick={() => void setRole(user)}
                    />
                  ) : null}
                  {local && !own ? (
                    <IconButton label={tPassword('setFor', { name: user.username })} icon={<KeyRound size={17} />} onClick={() => setResetting(user)} />
                  ) : null}
                  {!own ? (
                    <IconButton
                      label={t('users.delete', { name: user.username })}
                      icon={<Trash size={17} />}
                      onClick={() => setDeleting(user)}
                      className="hover:bg-danger-soft hover:text-danger"
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <PasswordDialog
        open={resetting !== null}
        title={resetting ? tPassword('titleFor', { name: resetting.username }) : ''}
        askCurrent={false}
        onClose={() => setResetting(null)}
        onSave={async (_current, password) => {
          const user = resetting!;
          await api.setUserPassword(user.id, password);
          setResetting(null);
          toast.show(tPassword('changedFor', { name: user.username }), 'success');
        }}
      />
      <AddUserDialog open={adding} onClose={() => setAdding(false)} onCreated={user => setUsers(current => [...(current ?? []), user])} />
      <Confirm
        open={deleting !== null}
        title={t('users.deleteTitle')}
        confirmLabel={t('users.deleteConfirm')}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => (deleting ? deleteUser(deleting) : undefined)}
      >
        {deleting ? t('users.deleteBody', { name: deleting.username }) : null}
      </Confirm>
    </>
  );
}
