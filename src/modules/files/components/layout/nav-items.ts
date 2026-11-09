'use client';

import { FolderOpen, Link, Star, Trash, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AppNavItem } from '@/components/layout/app-nav';
import { useFilesStatus } from '@/modules/files/components/files-status';
import { useItemDrop } from '@/modules/files/components/move-target';

/** The places in Files, in order. The sidebar and the tab bar both draw this list. */
export function useNavItems(): AppNavItem[] {
  const t = useTranslations('files.nav');
  const { status } = useFilesStatus();
  // Dropping items on My files takes them out of their folder.
  const toMyFiles = useItemDrop(null, t('files'));
  return [
    { href: '/files', label: t('files'), short: t('filesShort'), Icon: FolderOpen, drop: toMyFiles },
    { href: '/files/favorites', label: t('favorites'), Icon: Star },
    { href: '/files/shared', label: t('shared'), short: t('sharedShort'), Icon: Link },
    { href: '/files/shared-with-me', label: t('sharedWithMe'), short: t('sharedWithMeShort'), Icon: Users, count: status?.newShares ?? 0 },
    { href: '/files/trash', label: t('trash'), Icon: Trash },
  ];
}

/** My files is everything under /files that isn't one of the other places. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/files') {
    return pathname === '/files' || (/^\/files\/\d+$/.test(pathname));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
