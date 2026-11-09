import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appIcons } from '@/lib/page-title';
import { UploadView } from '@/modules/files/components/share/upload-view';
import { findUploadLink, uploadLinkState } from '@/modules/files/lib/upload-links';

/**
 * What a chat app shows when the link is pasted: whose folder it is, but
 * only without a password. Nobody else learns what is behind it.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const t = await getTranslations('files.uploadLink');
  const link = await findUploadLink((await params).token);
  const open = link && uploadLinkState(link) === 'ok' && !link.password_hash;
  return {
    title: open ? t('title', { name: link.owner.username }) : t('pageTitle'),
    description: open ? link.folder.name : undefined,
    robots: { index: false, follow: false },
    icons: appIcons('files'),
  };
}

export default async function UploadLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UploadView token={token} />;
}
