'use client';

import { Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { SuiteFrame } from '@/components/layout/suite-frame';
import { useMe } from '@/components/me';
import { EmptyState } from '@/components/ui';
import { APPS } from '@/modules/registry';

/** Admin: the people, then one page for each app that has something to manage. */
export function AdminFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const tNav = useTranslations('adminNav');
  const tApps = useTranslations();
  const me = useMe();
  const admin = me.role === 'ADMIN';
  const sections = admin
    ? [
        {
          href: '/admin',
          label: tNav('people'),
          icon: <Users size={18} aria-hidden="true" className="text-ink-muted" />,
          mark: <Users size={20} aria-hidden="true" />,
        },
        ...APPS.filter(app => app.admin).map(app => ({
          href: `/admin/${app.id}`,
          label: tApps(`${app.id}.app.name`),
          icon: <AppIcon app={app.id} size={20} className="rounded-[5px]" />,
          mark: <AppIcon app={app.id} size={32} className="rounded-lg" />,
        })),
      ]
    : [];
  return (
    <SuiteFrame Icon={Shield} title={t('title')} navLabel={tNav('label')} sections={sections}>
      {admin ? children : <EmptyState className="py-20" icon={<Shield size={24} />} title={t('onlyAdmins')} />}
    </SuiteFrame>
  );
}
