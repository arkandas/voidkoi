'use client';

import { useTranslations } from 'next-intl';

import { AppTabBar } from '@/components/layout/app-nav';

import { isCurrent, useNavItems } from './nav-items';

/** The sidebar's places along the bottom of a phone, under the thumb. */
export function TabBar() {
  const t = useTranslations('talk.nav');
  return <AppTabBar label={t('label')} items={useNavItems()} isCurrent={isCurrent} />;
}
