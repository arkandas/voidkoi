import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { HistoryView } from '@/modules/wiki/components/history-view';
import { editorOrNotFound } from '@/modules/wiki/lib/guards';
import { pageDetail, revisions } from '@/modules/wiki/lib/pages';
import { ancestry } from '@/modules/wiki/lib/tree';
import { parseId } from '@/lib/validate';
import { wikiContext } from '@/modules/wiki/lib/wiki';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations('wiki.history');
  const id = parseId((await params).id);
  const { reader } = await wikiContext();
  // The page's title only for whoever may open its history.
  const detail = id && reader.editor ? await pageDetail(id).catch(() => null) : null;
  return { title: detail ? t('tabTitle', { title: detail.title }) : undefined };
}

export default async function HistoryPage({ params }: Props) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const { index } = await editorOrNotFound();
  const [detail, list] = await Promise.all([pageDetail(id).catch(() => null), revisions(id)]);
  const entry = index.byId.get(id);
  if (!detail || detail.kind !== 'page' || !entry) notFound();
  const crumbs = ancestry(entry).map(each => ({ title: each.node.title, path: each.path }));
  return <HistoryView key={id} detail={detail} revisions={list} crumbs={crumbs} />;
}
