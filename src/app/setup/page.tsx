'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getProviders } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { AuthCard, AuthMessage } from '@/components/layout/auth-card';
import { Button, Input } from '@/components/ui';
import { readApiError } from '@/lib/error-codes';
import { useApiError } from '@/lib/use-api-error';
import { LIMITS } from '@/lib/validate';

/** The first account, made before anyone can sign in. It is the admin. */
export default function SetupPage() {
  const t = useTranslations('setup');
  const apiError = useApiError();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/users/check', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (data.hasUsers) router.replace('/login');
      })
      .catch(() => {});
    getProviders()
      .then(providers => {
        if (providers?.oidc) router.replace('/login');
      })
      .catch(() => {});
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError(t('passwordMismatch'));
    if (form.password.length < LIMITS.passwordMin) return setError(t('passwordTooShort', { min: LIMITS.passwordMin }));
    setLoading(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, email: form.email, password: form.password }),
      });
      if (!response.ok) throw await readApiError(response, 'createUserFailed');
      router.push('/login?setup=success');
    } catch (caught) {
      setError(apiError(caught, 'createUserFailed'));
      setLoading(false);
    }
  };

  return (
    <AuthCard tagline={t('tagline')}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('username')}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          maxLength={LIMITS.username}
          value={form.username}
          onChange={event => setForm({ ...form, username: event.target.value })}
        />
        <Input
          label={t('email')}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={LIMITS.email}
          value={form.email}
          onChange={event => setForm({ ...form, email: event.target.value })}
        />
        <Input
          label={t('password')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={LIMITS.passwordMin}
          maxLength={LIMITS.passwordMax}
          placeholder={t('passwordHint', { min: LIMITS.passwordMin })}
          value={form.password}
          onChange={event => setForm({ ...form, password: event.target.value })}
        />
        <Input
          label={t('confirmPassword')}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={event => setForm({ ...form, confirmPassword: event.target.value })}
        />
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
        <Button type="submit" disabled={loading} fullWidth size="lg" className="!mt-6">
          {loading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-faint">{t('note')}</p>
    </AuthCard>
  );
}
