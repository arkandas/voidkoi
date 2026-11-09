'use client';

import { Settings, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { SuiteFrame } from '@/components/layout/suite-frame';
import { useMe } from '@/components/me';
import { enabledApps } from '@/modules/registry';

/** Settings: the general ones, then one page for each app the account uses that has settings. */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('settings');
  const tNav = useTranslations('settingsNav');
  const tApps = useTranslations();
  const me = useMe();
  const sections = [
    {
      href: '/settings',
      label: tNav('general'),
      icon: <SlidersHorizontal size={18} aria-hidden="true" className="text-ink-muted" />,
      mark: <SlidersHorizontal size={20} aria-hidden="true" />,
    },
    ...enabledApps(me.apps)
      .filter(app => app.settings)
      .map(app => ({
        href: `/settings/${app.id}`,
        label: tApps(`${app.id}.app.name`),
        icon: <AppIcon app={app.id} size={20} className="rounded-[5px]" />,
        mark: <AppIcon app={app.id} size={32} className="rounded-lg" />,
      })),
  ];
  return (
    <SuiteFrame Icon={Settings} title={t('title')} navLabel={tNav('label')} sections={sections}>
      {children}
    </SuiteFrame>
  );
}
