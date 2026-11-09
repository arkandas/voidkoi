'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { AppIcon, Mark } from '@/components/brand/mark';
import { cn } from '@/lib/cn';

import { AccountMenu } from './account-menu';
import { useApps } from './use-apps';
import { badgeLabel } from './use-badges';

/**
 * The apps down the left edge of a wide screen, as in the Mac app: the open
 * one marked by a bar at the edge, its name beside each on hover. Your
 * picture at the foot opens Settings and signing out.
 */
export function Rail() {
  const t = useTranslations('shell');
  const apps = useApps();

  return (
    <nav aria-label={t('apps')} className="hidden w-[72px] shrink-0 flex-col items-center gap-3 border-r border-line/70 py-4 lg:flex">
      <Link
        href="/"
        aria-label={t('home')}
        className="rounded-full focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/30"
      >
        <Mark size={38} />
      </Link>
      <span aria-hidden="true" className="h-px w-8 bg-line" />
      <ul className="flex flex-1 flex-col items-center gap-2.5">
        {apps.map(app => (
          <li key={app.id} className="group relative">
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-1/2 -left-4 w-1 -translate-y-1/2 rounded-r-full bg-ink transition-all',
                app.current ? 'h-8' : 'h-0 group-hover:h-4',
              )}
            />
            <Link
              href={app.href}
              aria-current={app.current ? 'page' : undefined}
              aria-label={app.name}
              className="relative block rounded-xl focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/30"
            >
              <AppIcon
                app={app.id}
                size={42}
                className={cn('rounded-xl transition-[transform,filter]', app.current ? '' : 'saturate-[0.85] group-hover:saturate-100')}
              />
              {app.badge > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white ring-2 ring-canvas tabular-nums">
                  {badgeLabel(app.badge)}
                </span>
              ) : null}
              <span
                role="tooltip"
                className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2 py-1 text-[13px] font-semibold whitespace-nowrap text-canvas opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
              >
                {app.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <AccountMenu />
    </nav>
  );
}
