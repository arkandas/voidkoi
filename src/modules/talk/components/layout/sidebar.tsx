'use client';

import { useTranslations } from 'next-intl';

import { AppIcon } from '@/components/brand/mark';
import { AppSidebar } from '@/components/layout/app-nav';
import { useRealtime } from '@/modules/talk/lib/hooks/use-realtime';

import { isCurrent, useNavItems } from './nav-items';

/** Where you can go in Talk, and whether it is connected. Wide screens only. */
export function Sidebar() {
  const t = useTranslations('talk');
  const items = useNavItems();
  const { status } = useRealtime();

  return (
    <AppSidebar
      label={t('nav.label')}
      items={items}
      isCurrent={isCurrent}
      home="/talk"
      mark={<AppIcon app="talk" size={28} className="rounded-lg" />}
      name={t('app.name')}
      footer={
        status === 'reconnecting' ? (
          <p role="status" className="flex items-center gap-2 px-3 text-sm text-ink-muted">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-warning" />
            {t('nav.reconnecting')}
          </p>
        ) : null
      }
    />
  );
}
