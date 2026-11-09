import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TrashView } from '@/modules/wiki/components/trash-view';
import { editorOrNotFound } from '@/modules/wiki/lib/guards';
import { trashList } from '@/modules/wiki/lib/pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wiki.trash');
  return { title: t('title') };
}

export default async function TrashPage() {
  await editorOrNotFound();
  return <TrashView entries={await trashList()} />;
}
