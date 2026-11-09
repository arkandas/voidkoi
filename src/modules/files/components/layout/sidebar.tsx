'use client';

import { useTranslations } from 'next-intl';

import { AppIcon } from '@/components/brand/mark';
import { AppSidebar } from '@/components/layout/app-nav';
import { useFilesStatus } from '@/modules/files/components/files-status';

import { isCurrent, useNavItems } from './nav-items';
import { StorageMeter } from './storage-meter';

/** Where you can go in Files and how much space is left. Wide screens only. */
export function Sidebar() {
  const t = useTranslations('files.app');
  const tNav = useTranslations('nav');
  const items = useNavItems();
  const { status } = useFilesStatus();

  return (
    <AppSidebar
      label={tNav('label')}
      items={items}
      isCurrent={isCurrent}
      home="/files"
      mark={<AppIcon app="files" size={28} className="rounded-lg" />}
      name={t('name')}
      footer={status ? <StorageMeter status={status} /> : null}
    />
  );
}
