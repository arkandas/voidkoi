'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Mark } from '@/components/brand/mark';
import { Wordmark } from '@/components/brand/wordmark';
import { LanguageToggle, ThemeToggle } from '@/components/ui';

const WIDTHS = {
  /** A form. */
  sm: 'max-w-[400px]',
  /** Room for the upload panel beside nothing else. */
  md: 'max-w-[30rem]',
  /** A folder's files. */
  lg: 'max-w-2xl',
};

/** The signed-out pages: the language and theme switches, and a card. */
export function AuthPage({ children, width = 'sm' }: { children: ReactNode; width?: keyof typeof WIDTHS }) {
  return (
    <div className="login-page relative flex min-h-dvh items-center justify-center px-5">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className={`w-full ${WIDTHS[width]}`}>{children}</div>
    </div>
  );
}

/** The card the sign-in pages share: the mark and name in a header band over the form. */
export function AuthCard({ children, tagline }: { children: ReactNode; tagline?: string }) {
  const t = useTranslations('app');
  return (
    <AuthPage>
      <main className="relative w-full overflow-hidden rounded-2xl border border-line shadow-[0_2px_4px_rgba(0,0,0,0.04),0_28px_64px_-32px_rgba(0,0,0,0.4)]">
        <header className="flex items-center gap-4 border-b border-line bg-raised px-6 py-6 sm:px-7">
          <Mark size={52} />
          <span className="flex flex-col">
            <Wordmark height={21} className="text-ink" />
            <span className="mt-2.5 text-[15px] text-ink-muted">{tagline ?? t('tagline')}</span>
          </span>
        </header>
        <div className="bg-surface px-6 py-7 sm:px-7">{children}</div>
      </main>
    </AuthPage>
  );
}

export function AuthMessage({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertTriangle : Check;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'mb-5 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger'
          : 'mb-5 flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3.5 py-3 text-sm font-medium text-accent'
      }
    >
      <Icon size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthSpinner() {
  return (
    <div className="login-page flex min-h-dvh items-center justify-center">
      <Loader2 size={22} className="animate-spin text-ink-faint" />
    </div>
  );
}
