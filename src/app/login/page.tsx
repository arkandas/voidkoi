'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';

import { AuthCard, AuthMessage, AuthSpinner } from '@/components/layout/auth-card';
import { Button } from '@/components/ui';
import { signOutFully } from '@/lib/sign-out';

type Providers = Awaited<ReturnType<typeof getProviders>>;

const primaryButton =
  'mt-2 h-[52px] w-full rounded-lg bg-accent text-[17px] font-semibold text-accent-ink shadow-xs shadow-accent/20 ' +
  'transition-colors hover:bg-accent-hover disabled:opacity-70';

/** Only somewhere on this site: never off to another one after signing in. */
function sameOriginPath(url: string | null) {
  if (!url) return '/';
  try {
    const target = new URL(url, window.location.origin);
    const path = `${target.pathname}${target.search}${target.hash}`;
    // "//host" or "/\\host" would be read as another site by the router.
    return target.origin === window.location.origin && !/^\/[\/\\]/.test(path) ? path : '/';
  } catch {
    return '/';
  }
}

function PasswordSignIn() {
  const t = useTranslations('login');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const notice = params.get('setup') === 'success' ? t('setupDone') : params.has('signedOut') ? t('signedOut') : '';

  useEffect(() => {
    fetch('/api/users/check', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (data.hasUsers === false) router.replace('/setup');
      })
      .catch(() => {});
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', { username: form.username, password: form.password, redirect: false });
      if (result?.error) {
        setError(result.error === 'TooManyAttempts' ? tErrors('tooManyAttempts') : t('invalidCredentials'));
        setLoading(false);
        return;
      }
      router.replace(sameOriginPath(params.get('callbackUrl')));
      router.refresh();
    } catch {
      setError(t('failed'));
      setLoading(false);
    }
  };

  const field =
    'peer h-[52px] w-full rounded-lg border border-line-strong bg-raised pl-11 pr-4 text-[17px] text-ink ' +
    'transition-colors hover:border-ink-faint focus:border-accent focus:outline-hidden focus:ring-4 focus:ring-accent/15';
  const icon =
    'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint transition-colors peer-focus:text-accent';
  const passwordLabel = showPassword ? t('hidePassword') : t('showPassword');

  return (
    <>
      {notice && !error ? <AuthMessage tone="success">{notice}</AuthMessage> : null}
      <form onSubmit={submit}>
        <div className="mb-4">
          <label htmlFor="username" className="mb-2 block text-[15px] font-semibold text-ink">
            {t('username')}
          </label>
          <div className="relative">
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              value={form.username}
              onChange={event => setForm({ ...form, username: event.target.value })}
              className={field}
            />
            <User size={18} className={icon} />
          </div>
        </div>
        <div className="mb-4">
          <label htmlFor="password" className="mb-2 block text-[15px] font-semibold text-ink">
            {t('password')}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={form.password}
              onChange={event => setForm({ ...form, password: event.target.value })}
              className={`${field} pr-12`}
            />
            <Lock size={18} className={icon} />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              tabIndex={-1}
              title={passwordLabel}
              aria-label={passwordLabel}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-muted hover:text-ink-muted"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {error ? <AuthMessage tone="error">{error}</AuthMessage> : null}
        <Button type="submit" disabled={loading} className={primaryButton}>
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
    </>
  );
}

/** Someone signed in to the provider who has no account here yet: asked before one is made. */
function NewAccount({ name, provider }: { name: string; provider: string }) {
  const t = useTranslations('login');
  const [busy, setBusy] = useState<'create' | 'other' | null>(null);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <>
      <p className="mb-5 text-[15px] leading-relaxed text-ink-muted">
        {t.rich('oidc.newAccount', { name, b: chunks => <b className="font-semibold text-ink">{chunks}</b> })}
      </p>
      <Button
        disabled={busy !== null}
        onClick={() => {
          setBusy('create');
          // The yes, for the sign-in that follows: it creates the account.
          const https = window.location.protocol === 'https:';
          document.cookie = `${https ? '__Host-' : ''}voidkoi.new-account=1; Max-Age=120; Path=/; SameSite=Lax${https ? '; Secure' : ''}`;
          void signIn('oidc', { callbackUrl: '/' });
        }}
        className={primaryButton}
      >
        {busy === 'create' ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" />
            {t('oidc.creatingAccount')}
          </>
        ) : (
          t('oidc.createAccount')
        )}
      </Button>
      <Button
        variant="ghost"
        fullWidth
        disabled={busy !== null}
        onClick={() => {
          setBusy('other');
          void signOutFully();
        }}
        className="mt-3 h-11 text-[15px] font-medium text-ink-muted hover:text-ink disabled:opacity-60"
      >
        {t('oidc.otherAccount', { provider })}
      </Button>
    </>
  );
}

function OidcSignIn({ name }: { name: string }) {
  const t = useTranslations('login');
  const params = useSearchParams();
  const newAccount = params.get('newAccount');
  const error = params.get('error');
  const callbackUrl = params.get('callbackUrl') || '/';
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  if (newAccount !== null) return <NewAccount name={newAccount} provider={name} />;

  return (
    <>
      {error ? (
        <AuthMessage tone="error">
          {error === 'AccessDenied' ? t('oidc.accessDenied', { provider: name }) : t('oidc.failed', { provider: name })}
        </AuthMessage>
      ) : params.has('signedOut') ? (
        <AuthMessage tone="success">{t('signedOut')}</AuthMessage>
      ) : null}
      <Button
        disabled={redirecting}
        onClick={() => {
          setRedirecting(true);
          void signIn('oidc', { callbackUrl: sameOriginPath(callbackUrl) });
        }}
        className={primaryButton}
      >
        {redirecting ? (
          <>
            <Loader2 size={16} className="mr-2 animate-spin" />
            {t('oidc.redirecting', { provider: name })}
          </>
        ) : (
          t('oidc.submit', { provider: name })
        )}
      </Button>
    </>
  );
}

function LoginScreen() {
  const [providers, setProviders] = useState<Providers | undefined>(undefined);

  useEffect(() => {
    getProviders()
      .then(setProviders)
      .catch(() => setProviders(null));
  }, []);

  if (providers === undefined) return <AuthSpinner />;

  return <AuthCard>{providers?.oidc ? <OidcSignIn name={providers.oidc.name} /> : <PasswordSignIn />}</AuthCard>;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSpinner />}>
      <LoginScreen />
    </Suspense>
  );
}
