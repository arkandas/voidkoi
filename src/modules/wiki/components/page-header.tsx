'use client';

import { ChevronRight, FilePlus2, Home, FolderPlus, History, Menu, MoreHorizontal, Pencil, Settings2, Share2, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader, type PageHeaderProps } from '@/components/layout/page-layout';
import { ActionMenu, Button, IconButton, type MenuAction } from '@/components/ui';
import { urls } from '@/modules/wiki/lib/api';
import type { Crumb } from '@/modules/wiki/lib/views';

import { useWiki } from './wiki-provider';

/** Where something sits: the folders above it, each a way back up. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const t = useTranslations('wiki.page');
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={t('breadcrumbs')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-0.5">
        {crumbs.map((crumb, at) => (
          <li key={crumb.path} className="flex min-w-0 items-center gap-0.5">
            {at > 0 ? <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-ink-faint" /> : null}
            <Link href={urls.page(crumb.path)} className="truncate rounded-sm transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50">
              {crumb.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Where a page or folder sits, from the start of the wiki: the header's path. */
export function PagePath({ wikiName, crumbs }: { wikiName: string; crumbs: Crumb[] }) {
  const t = useTranslations('wiki.page');
  return (
    <nav aria-label={t('breadcrumbs')} className="min-w-0 text-[15px] font-medium text-ink-muted">
      <ol className="flex min-w-0 items-center gap-1">
        <li className="flex shrink-0 items-center">
          <Link
            href={urls.page('')}
            aria-label={wikiName}
            title={wikiName}
            className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Home size={18} aria-hidden="true" />
          </Link>
        </li>
        {crumbs.map(crumb => (
          <li key={crumb.path} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-ink-faint" />
            <Link
              href={urls.page(crumb.path)}
              className="truncate rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {crumb.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A page's or folder's title, in large type at the top of what it shows. */
export function PageTitle({ title }: { title: string }) {
  return <p className="mb-8 text-[2.5rem] leading-[1.15] font-bold tracking-tight text-ink">{title}</p>;
}

/**
 * A wiki page's header: the suite's, with the button that opens the tree on a
 * phone and, for a page or folder, its path in place of the title.
 */
export function WikiHeader({ path, ...props }: Omit<PageHeaderProps, 'lead' | 'subtitle' | 'switcher' | 'heading'> & { path?: { wikiName: string; crumbs: Crumb[] } }) {
  const t = useTranslations('wiki.shell');
  const { visitor, showTree } = useWiki();
  return (
    <PageHeader
      {...props}
      switcher={!visitor}
      lead={<IconButton label={t('menu')} icon={<Menu size={20} />} onClick={showTree} className="-mx-1 shrink-0 lg:hidden" />}
      heading={path ? <PagePath wikiName={path.wikiName} crumbs={path.crumbs} /> : undefined}
    />
  );
}

/** What an editor can do with the page or folder on show. Nothing for anyone else. */
export function NodeActions({ node }: { node: { id: number; kind: 'page' | 'folder'; unpublished?: boolean } }) {
  const t = useTranslations('wiki.page');
  const router = useRouter();
  const { canEdit, open } = useWiki();
  if (!canEdit) return null;

  const menu: MenuAction[] =
    node.kind === 'page'
      ? [
          { label: t('history'), icon: History, onSelect: () => router.push(urls.history(node.id)), hidden: node.unpublished },
          { label: t('settings'), icon: Settings2, onSelect: () => open({ kind: 'settings', id: node.id }) },
          { label: t('delete'), icon: Trash, danger: true, onSelect: () => open({ kind: 'delete', id: node.id }) },
        ]
      : [
          { label: t('newFolder'), icon: FolderPlus, onSelect: () => open({ kind: 'create', nodeKind: 'folder', parentId: node.id }) },
          { label: t('settings'), icon: Settings2, onSelect: () => open({ kind: 'settings', id: node.id }) },
          { label: t('delete'), icon: Trash, danger: true, onSelect: () => open({ kind: 'delete', id: node.id }) },
        ];

  return (
    <div className="flex shrink-0 items-center gap-1">
      {node.kind === 'page' ? (
        <Button variant="outline" icon={<Pencil size={16} />} onClick={() => router.push(urls.edit(node.id))}>
          {t('edit')}
        </Button>
      ) : (
        <Button variant="outline" icon={<FilePlus2 size={16} />} onClick={() => open({ kind: 'create', nodeKind: 'page', parentId: node.id })}>
          {t('newPage')}
        </Button>
      )}
      <IconButton label={t('share')} icon={<Share2 size={18} />} onClick={() => open({ kind: 'share', id: node.id })} />
      <ActionMenu label={t('more')} actions={menu} triggerClassName="size-10">
        <MoreHorizontal size={17} aria-hidden="true" />
      </ActionMenu>
    </div>
  );
}
