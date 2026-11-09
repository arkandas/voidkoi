import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PageEditor } from '@/modules/wiki/components/editor/page-editor';
import { editorOrNotFound } from '@/modules/wiki/lib/guards';
import { pageDetail } from '@/modules/wiki/lib/pages';
import { parseId } from '@/lib/validate';

type Props = { params: Promise<{ id: string }> };

async function load(raw: string) {
  const id = parseId(raw);
  if (!id) notFound();
  await editorOrNotFound();
  const detail = await pageDetail(id).catch(() => null);
  if (!detail || detail.kind !== 'page') notFound();
  return detail;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations('wiki.editor');
  const detail = await load((await params).id);
  return { title: t('tabTitle', { title: detail.draft?.title || detail.title || t('untitled') }) };
}

export default async function EditPage({ params }: Props) {
  const detail = await load((await params).id);
  // A new key for every page, so moving from one editor to another starts clean.
  return <PageEditor key={detail.id} detail={detail} />;
}
