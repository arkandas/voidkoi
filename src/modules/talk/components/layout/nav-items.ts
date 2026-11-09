'use client';

import { FolderOpen, MessageCircle, Phone, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AppNavItem } from '@/components/layout/app-nav';
import { useTalkData } from '@/modules/talk/lib/hooks/use-talk-data';

/** The places in Talk, in order. The sidebar and the phone's tab bar both draw this list. */
export function useNavItems(): AppNavItem[] {
  const t = useTranslations('talk.nav');
  const { totalUnread, unseenMissed } = useTalkData();
  return [
    { href: '/talk', label: t('chats'), Icon: MessageCircle, count: totalUnread },
    { href: '/talk/calls', label: t('calls'), Icon: Phone, count: unseenMissed, urgent: true },
    { href: '/talk/people', label: t('people'), Icon: Users, count: 0 },
    { href: '/talk/files', label: t('files'), Icon: FolderOpen, count: 0 },
  ];
}

/** Chats is /talk itself; the other places are under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/talk') return pathname === '/talk';
  return pathname === href || pathname.startsWith(`${href}/`);
}
