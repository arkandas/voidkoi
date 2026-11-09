'use client';

import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { AuthPage } from '@/components/layout/auth-card';
import { UnlockForm } from '@/components/ui';

/** The page around what a link opens, without the rest of the app: the share link's and the upload link's. */
export function LinkShell({ children, width }: { children: ReactNode; width?: ComponentProps<typeof AuthPage>['width'] }) {
  return (
    <AuthPage width={width}>
      <main className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_4px_rgba(0,0,0,0.04),0_28px_64px_-32px_rgba(0,0,0,0.4)]">
        <header className="flex items-center gap-2.5 border-b border-line bg-raised px-5 py-3.5">
          <AppIcon app="files" size={26} className="rounded-lg" />
          <span className="text-[17px] font-bold tracking-tight text-ink">Files</span>
        </header>
        {children}
      </main>
    </AuthPage>
  );
}

export function Notice({ icon, title, body, children }: { icon: ReactNode; title: string; body?: string; children?: ReactNode }) {
  return (
    <LinkShell>
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</span>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {body ? <p className="mt-1.5 max-w-sm leading-relaxed text-ink-muted">{body}</p> : null}
        {children ? <div className="mt-6 w-full max-w-xs">{children}</div> : null}
      </div>
    </LinkShell>
  );
}

/** A link's password. `unlock` checks it with the server, which remembers it for this browser. */
export function PasswordForm({ body, unlock, onUnlocked }: { body: string; unlock(password: string): Promise<unknown>; onUnlocked(): void }) {
  const t = useTranslations('files.link');
  return (
    <Notice icon={<KeyRound size={24} />} title={t('password.title')} body={body}>
      <UnlockForm label={t('password.label')} submit={t('password.submit')} unlock={unlock} onUnlocked={onUnlocked} />
    </Notice>
  );
}
