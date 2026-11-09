import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { appPageTitle } from '@/lib/page-title';

import { FileBrowser } from '@/modules/files/components/file-browser';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('files.browser');
  return { title: await appPageTitle('files', t('title')) };
}

export default function MyFilesPage() {
  return <FileBrowser folderId={null} />;
}
