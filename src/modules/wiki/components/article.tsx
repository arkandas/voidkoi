import { Pencil } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { MarkdownView } from '@/modules/wiki/components/markdown/markdown-view';
import { Avatar } from '@/components/ui';
import { urls } from '@/modules/wiki/lib/api';
import { renderMarkdown } from '@/modules/wiki/lib/markdown/render';
import type { Crumb, PageText } from '@/modules/wiki/lib/views';

import { DraftBar } from './draft-bar';
import { PageTitle } from './page-header';
import { Column } from './frame';
import { Toc, TocDropdown } from './toc';

/**
 * A page as readers see it under its header: the text, its sections beside
 * it, when it last changed, and the pages before and after it.
 */
export async function Article({
  visitor,
  id,
  text,
  previous,
  next,
  canEdit,
  unpublished,
  hasDraft,
}: {
  /** Signed out: the pictures of the people who wrote it stay with the accounts. */
  visitor: boolean;
  id: number;
  text: PageText;
  previous: Crumb | null;
  next: Crumb | null;
  canEdit: boolean;
  unpublished: boolean;
  hasDraft: boolean;
}) {
  const t = await getTranslations('wiki.page');
  const format = await getFormatter();
  const { tree, toc } = renderMarkdown(text.content);
  const updated = format.dateTime(new Date(text.at), { dateStyle: 'medium' });
  const by = text.by && visitor ? { ...text.by, avatar: null } : text.by;

  return (
    <Column aside={toc.length > 0 ? <Toc items={toc} /> : null}>
      <article>
        <PageTitle title={text.title || t('untitled')} />
        {canEdit ? (
          <DraftBar
            id={id}
            showingDraft={text.draft}
            unpublished={unpublished}
            hasDraft={hasDraft}
          />
        ) : null}
        <TocDropdown items={toc} />
        <MarkdownView tree={tree} />

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          {canEdit ? (
            <Link
              href={urls.edit(id)}
              className="-ml-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-accent transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Pencil size={14} aria-hidden="true" />
              {t('editThis')}
            </Link>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2">
            {by ? <Avatar person={by} size="xs" /> : null}
            {by
              ? t(text.draft ? 'savedBy' : 'updatedBy', {
                  date: updated,
                  name: by.name ?? by.username,
                })
              : t(text.draft ? 'saved' : 'updated', { date: updated })}
          </span>
        </footer>

        {previous || next ? (
          <nav
            aria-label={t('pagination')}
            className="mt-8 grid gap-4 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={urls.page(previous.path)}
                className="group flex flex-col gap-1 rounded-md border border-line px-4 py-3 transition-colors hover:border-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span className="text-[13px] font-medium text-ink-muted">
                  {t('previous')}
                </span>
                <span className="truncate font-semibold text-accent">
                  « {previous.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next ? (
              <Link
                href={urls.page(next.path)}
                className="group flex flex-col items-end gap-1 rounded-md border border-line px-4 py-3 text-right transition-colors hover:border-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span className="text-[13px] font-medium text-ink-muted">
                  {t('next')}
                </span>
                <span className="max-w-full truncate font-semibold text-accent">
                  {next.title} »
                </span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </article>
    </Column>
  );
}
