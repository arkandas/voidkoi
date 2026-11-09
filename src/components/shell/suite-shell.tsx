'use client';

import { CloudOff, RotateCw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

import { MeProvider, useMeContext } from '@/components/me';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { appOfPath, uses } from '@/modules/registry';
import { TalkEverywhere } from '@/modules/talk/components/layout/talk-everywhere';

import { Rail } from './rail';
import { BadgesProvider } from './use-badges';

/** The app last open, for opening it again from the home address. */
export const LAST_APP_COOKIE = 'voidkoi-app';

/**
 * Before the account is here: a spinner, an error with another try when it didn't load, and after a long wait a way
 * to load the page again. That last part the stylesheet shows on its own, so it comes up even when the page's
 * scripts never run.
 */
function Waiting({ failed, onRetry }: { failed: boolean; onRetry(): void }) {
  const t = useTranslations('shell');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  if (failed) {
    return (
      <div className="app-shell flex items-center justify-center bg-canvas">
        <EmptyState
          icon={<CloudOff size={24} />}
          title={t('loadFailed')}
          action={
            <Button icon={<RotateCw size={16} />} onClick={onRetry}>
              {t('tryAgain')}
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <div className="app-shell flex items-center justify-center bg-canvas">
      <div className="relative flex flex-col items-center">
        <Spinner label={tCommon('loading')} />
        <div className="after-a-while absolute top-full mt-5 flex w-max flex-col items-center gap-3">
          <p className="text-sm text-ink-muted">{t('stillLoading')}</p>
          <a
            href={pathname}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
          >
            <RotateCw size={15} aria-hidden="true" />
            {t('reload')}
          </a>
        </div>
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { me, setMe, failed, retry } = useMeContext();
  const locale = useLocale();
  const pathname = usePathname();
  const app = appOfPath(pathname)?.id;

  // The server writes some things on its own, like notifications: in the language last used here.
  const savedLocale = me?.locale;
  useEffect(() => {
    if (savedLocale === undefined || savedLocale === locale) return;
    api.saveProfile({ locale }).then(setMe, () => {});
  }, [savedLocale, locale, setMe]);

  useEffect(() => {
    if (app) document.cookie = `${LAST_APP_COOKIE}=${app}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [app]);

  if (!me) return <Waiting failed={failed} onRetry={retry} />;

  return (
    <BadgesProvider>
      <div className="app-shell flex bg-canvas">
        <Rail />
        {uses(me.apps, 'talk') ? <TalkEverywhere>{children}</TalkEverywhere> : <div className="flex min-w-0 flex-1">{children}</div>}
      </div>
    </BadgesProvider>
  );
}

/** Everything behind the sign-in: the account, the rail of apps, and the app open beside it. */
export function SuiteShell({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <Frame>{children}</Frame>
    </MeProvider>
  );
}
