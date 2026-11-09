import { BookOpen, FolderOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';

import { EmptyState } from '@/components/ui';
import { urls } from '@/modules/wiki/lib/api';
import { excerpt } from '@/modules/wiki/lib/markdown/render';
import { joinPath, resolveView } from '@/modules/wiki/lib/views';
import { wikiContext } from '@/modules/wiki/lib/wiki';

import { Article } from './article';
import { Cards } from './cards';
import { Column, WikiPage } from './frame';
import { NewHere } from './new-here';
import { NodeActions, PageTitle, WikiHeader } from './page-header';
import { PasswordPrompt, SignInPrompt } from './prompts';

/** What a page of the wiki is handed: its address under `/wiki`, and `?draft=1` for an editor's draft. */
export interface WikiRouteProps {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function viewFor({ params, searchParams }: WikiRouteProps) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  return resolveView(joinPath(path), query.draft === '1');
}

export async function wikiMetadata(props: WikiRouteProps): Promise<Metadata> {
  const [view, { settings }] = await Promise.all([viewFor(props), wikiContext()]);
  const hidden = { index: false, follow: false };
  switch (view.kind) {
    case 'page': {
      const open = view.effective === 'public' && !view.text.draft;
      const description = open ? excerpt(view.text.content) || undefined : undefined;
      return {
        title: view.isHome ? { absolute: settings.wiki_name } : view.text.title,
        description,
        robots: settings.allow_indexing && open ? { index: true, follow: true } : hidden,
        openGraph: open ? { title: view.text.title, description, siteName: settings.wiki_name, type: 'article' } : undefined,
      };
    }
    case 'folder':
      return { title: view.title, robots: settings.allow_indexing && view.effective === 'public' ? { index: true, follow: true } : hidden };
    case 'index':
      return { title: { absolute: settings.wiki_name } };
    default:
      return { robots: hidden };
  }
}

/** A page, a folder or the start of the wiki, in the panel, inside the suite or for a visitor. */
export async function WikiView({ visitor, ...props }: WikiRouteProps & { visitor: boolean }) {
  const [view, { reader, settings, signedIn }] = await Promise.all([viewFor(props), wikiContext()]);
  const t = await getTranslations('wiki.folder');
  const start = <WikiHeader icon={<BookOpen size={18} />} title={settings.wiki_name} />;

  switch (view.kind) {
    case 'redirect':
      permanentRedirect(urls.page(view.path));
    case 'notFound':
      notFound();
    case 'signIn':
      // Signed in to an account that doesn't use the wiki: its private pages aren't there.
      if (signedIn) notFound();
      return (
        <WikiPage header={start}>
          <SignInPrompt />
        </WikiPage>
      );
    case 'password':
      return (
        <WikiPage header={start}>
          <PasswordPrompt nodeId={view.nodeId} />
        </WikiPage>
      );
    case 'page':
      return (
        <WikiPage
          header={
            <WikiHeader
              title={view.text.title || t('untitled')}
              path={{ wikiName: settings.wiki_name, crumbs: view.crumbs }}
              action={<NodeActions node={{ id: view.id, kind: 'page', unpublished: view.unpublished }} />}
            />
          }
        >
          <Article
            visitor={visitor}
            id={view.id}
            text={view.text}
            previous={view.previous}
            next={view.next}
            canEdit={reader.editor}
            unpublished={view.unpublished}
            hasDraft={view.hasDraft}
          />
        </WikiPage>
      );
    case 'folder':
      return (
        <WikiPage
          header={
            <WikiHeader
              title={view.title || t('untitled')}
              // An empty folder has no title below, so its own name ends the path.
              path={{
                wikiName: settings.wiki_name,
                crumbs: view.cards.length > 0 ? view.crumbs : [...view.crumbs, { title: view.title || t('untitled'), path: view.path }],
              }}
              action={<NodeActions node={{ id: view.id, kind: 'folder' }} />}
            />
          }
        >
          {view.cards.length > 0 ? (
            <Column>
              <PageTitle title={view.title || t('untitled')} />
              <Cards cards={view.cards} />
            </Column>
          ) : (
            <EmptyState className="py-20" icon={<FolderOpen size={24} />} title={t('empty')} action={<NewHere parentId={view.id} />} />
          )}
        </WikiPage>
      );
    case 'index':
      return (
        <WikiPage header={start}>
          {view.cards.length > 0 ? (
            <Column>
              <Cards cards={view.cards} />
            </Column>
          ) : (
            <EmptyState className="py-20" icon={<BookOpen size={24} />} title={t('emptyWiki')} action={<NewHere parentId={null} />} />
          )}
        </WikiPage>
      );
  }
}
