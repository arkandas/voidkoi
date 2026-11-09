'use client';

import { KeyRound, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { UnlockForm } from '@/components/ui';
import { api } from '@/modules/wiki/lib/api';

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span aria-hidden="true" className="mb-3 text-ink-faint">{icon}</span>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        <div className="mt-6 w-full">{children}</div>
      </div>
    </div>
  );
}

/** A private page or folder, for a visitor. */
export function SignInPrompt() {
  const t = useTranslations('wiki.prompts');
  const pathname = usePathname();
  return (
    <Panel icon={<LogIn size={24} />} title={t('signInTitle')}>
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
      >
        {t('signIn')}
      </Link>
    </Panel>
  );
}

/** A page behind a password: its own, its folder's or the wiki's. */
export function PasswordPrompt({ nodeId }: { nodeId: number | null }) {
  const t = useTranslations('wiki.prompts');
  const router = useRouter();
  return (
    <Panel icon={<KeyRound size={24} />} title={t('passwordTitle')}>
      <UnlockForm label={t('password')} submit={t('open')} unlock={password => api.unlock(nodeId, password)} onUnlocked={() => router.refresh()} />
    </Panel>
  );
}
