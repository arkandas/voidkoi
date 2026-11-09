import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ShareView } from '@/modules/files/components/share/share-view';
import { isToken } from '@/lib/ids';
import { appIcons } from '@/lib/page-title';
import { findLink, linkState } from '@/modules/files/lib/shares';

/**
 * What a chat app shows when the link is pasted: the file's name, but only
 * for a public link without a password. Nobody else learns what is behind it.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const t = await getTranslations('files.link');
  const { token } = await params;
  const link = isToken(token) ? await findLink(token) : null;
  const open = link && linkState(link) === 'ok' && link.access === 'PUBLIC' && !link.password_hash;
  return {
    title: open ? link.item.name : t('pageTitle'),
    description: open ? t('sharedBy', { name: link.owner.username }) : undefined,
    robots: { index: false, follow: false },
    icons: appIcons('files'),
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
