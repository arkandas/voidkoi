'use client';

import { useTranslations } from 'next-intl';

import { AppTabBar } from '@/components/layout/app-nav';

import { isCurrent, useNavItems } from './nav-items';

/** The sidebar's places along the bottom of a phone. */
export function TabBar() {
  const t = useTranslations('nav');
  return <AppTabBar label={t('label')} items={useNavItems()} isCurrent={isCurrent} />;
}
