'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useMe } from '@/components/me';
import { appOfPath, enabledApps, type AppInfo } from '@/modules/registry';

import { useBadges } from './use-badges';

export interface ShownApp extends AppInfo {
  name: string;
  current: boolean;
  /** Something new there. */
  badge: number;
}

/** The apps this account uses, in rail order, with their names and which one is open. */
export function useApps(): ShownApp[] {
  const t = useTranslations();
  const me = useMe();
  const pathname = usePathname();
  const badges = useBadges();
  const current = appOfPath(pathname)?.id;
  return enabledApps(me.apps).map(app => ({
    ...app,
    name: t(`${app.id}.app.name`),
    current: app.id === current,
    badge: badges[app.id] ?? 0,
  }));
}
