'use client';

import { LogOut, Settings, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useMe } from '@/components/me';
import { ActionMenu, Avatar } from '@/components/ui';
import { signOutFully } from '@/lib/sign-out';

/** Your picture at the foot of the rail: Settings, Admin and signing out. */
export function AccountMenu() {
  const t = useTranslations('nav');
  const me = useMe();
  const router = useRouter();
  return (
    <ActionMenu
      label={me.name ?? me.username}
      triggerClassName="rounded-full p-0.5 transition-shadow hover:ring-4 hover:ring-line focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/30"
      actions={[
        { label: t('settings'), icon: Settings, onSelect: () => router.push('/settings') },
        { label: t('admin'), icon: Shield, onSelect: () => router.push('/admin'), hidden: me.role !== 'ADMIN' },
        { label: t('signOut'), icon: LogOut, onSelect: () => void signOutFully(), danger: true },
      ]}
    >
      <Avatar person={me} size="md" />
    </ActionMenu>
  );
}
