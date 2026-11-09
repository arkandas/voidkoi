import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { FileBrowser } from '@/modules/files/components/file-browser';
import { accessTo } from '@/modules/files/lib/items';
import { currentUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

/** The folder's name, for someone who can open it. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = await getTranslations('files.browser');
  const id = parseId((await params).id);
  const user = id ? await currentUser() : null;
  const access = user && id ? await accessTo(user.id, id) : null;
  return { title: access?.item.kind === 'FOLDER' ? access.item.name : t('title') };
}

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  return <FileBrowser key={id} folderId={id} />;
}
