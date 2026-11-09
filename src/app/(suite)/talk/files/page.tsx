import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { FilesPage } from '@/modules/talk/components/pages/files';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('talk.nav');
  return { title: t('files') };
}

export default function TalkFilesPage() {
  return <FilesPage />;
}
