'use client';

import { FilePlus2, FolderPlus, LogIn, Search, Trash, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { AppAside, AppBrand, AppPanel } from '@/components/layout/app-nav';
import { Button, IconButton, LanguageToggle, ThemeToggle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { urls } from '@/modules/wiki/lib/api';
import type { TreeNodeDto } from '@/modules/wiki/lib/api-types';

import { NodeDialogs } from './node-dialogs';
import { PageTree, useRevealCurrent } from './page-tree';
import { SearchDialog } from './search-dialog';
import { useWiki, WikiProvider } from './wiki-provider';

interface ShellProps {
  name: string;
  tree: TreeNodeDto[];
  homePageId: number | null;
  children: ReactNode;
}

/** The wiki inside the suite: its tree down the side, as other apps have their places, and the page beside it. */
export function WikiShell({ canEdit, children, ...props }: ShellProps & { canEdit: boolean }) {
  return (
    <WikiProvider visitor={false} canEdit={canEdit} {...props}>
      <Frame foot={canEdit ? <TrashPlace /> : null}>{children}</Frame>
    </WikiProvider>
  );
}

/** The wiki for visitors, at the same addresses: the same tree and panel without the suite around them, and the way to sign in. */
export function PublicShell({ children, ...props }: ShellProps) {
  return (
    <WikiProvider visitor canEdit={false} {...props}>
      <Frame foot={<VisitorFoot />}>{children}</Frame>
    </WikiProvider>
  );
}

function Frame({ foot, children }: { foot: ReactNode; children: ReactNode }) {
  const { openSearch, canEdit, treeOpen, hideTree } = useWiki();
  const pathname = usePathname();

  // ⌘K or Ctrl+K anywhere, and / outside a field, open the search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  // A link followed from the drawer closes it.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    if (treeOpen) hideTree();
  }

  return (
    <>
      <AppAside>
        <Brand />
        <Places foot={foot} />
      </AppAside>
      <TreeDrawer foot={foot} />
      <AppPanel>{children}</AppPanel>
      <SearchDialog />
      {canEdit ? <NodeDialogs /> : null}
    </>
  );
}

/** The wiki's mark and name, the way to its start. */
function Brand({ onNavigate }: { onNavigate?(): void }) {
  const { name } = useWiki();
  return <AppBrand href={urls.page('')} mark={<AppIcon app="wiki" size={28} className="rounded-lg" />} name={name} onNavigate={onNavigate} />;
}

/** Search, New page and New folder, the tree, and what the frame keeps at the foot. */
function Places({ foot, onNavigate }: { foot: ReactNode; onNavigate?(): void }) {
  const t = useTranslations('wiki.shell');
  const { canEdit, open, openSearch } = useWiki();
  useRevealCurrent();

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 text-left text-sm text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 dark:bg-card"
        >
          <Search size={15} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">{t('search')}</span>
          <kbd className="hidden rounded border border-line px-1.5 font-sans text-[11px] leading-[18px] font-medium text-ink-faint lg:inline">⌘K</kbd>
        </button>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<FilePlus2 size={15} />}
              className="flex-1"
              onClick={() => open({ kind: 'create', nodeKind: 'page', parentId: null })}
            >
              {t('newPage')}
            </Button>
            <IconButton
              size="sm"
              variant="outline"
              label={t('newFolder')}
              icon={<FolderPlus size={16} />}
              onClick={() => open({ kind: 'create', nodeKind: 'folder', parentId: null })}
            />
          </div>
        ) : null}
      </div>

      <nav aria-label={t('navigation')} className="themed-scroll -mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
        <PageTree onNavigate={onNavigate} />
      </nav>

      {foot}
    </>
  );
}

/** On a phone, where there is no sidebar: the same places, sliding in from the side. */
function TreeDrawer({ foot }: { foot: ReactNode }) {
  const t = useTranslations('wiki.shell');
  const { treeOpen, hideTree } = useWiki();

  useEffect(() => {
    if (!treeOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') hideTree();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [treeOpen, hideTree]);

  return (
    <div className={cn('fixed inset-0 z-40 lg:hidden', !treeOpen && 'pointer-events-none')}>
      <div
        aria-hidden="true"
        onClick={hideTree}
        className={cn('absolute inset-0 bg-scrim transition-opacity duration-300', treeOpen ? 'opacity-100' : 'opacity-0')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('menu')}
        className={cn(
          'absolute inset-y-0 left-0 flex w-[84%] max-w-80 flex-col bg-canvas shadow-2xl transition-[transform,visibility] duration-300 ease-out',
          treeOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line pr-2 pl-2">
          <Brand onNavigate={hideTree} />
          <IconButton label={t('closeMenu')} icon={<X size={18} />} onClick={hideTree} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 pt-3 pb-safe">
          {treeOpen ? <Places foot={foot} onNavigate={hideTree} /> : null}
        </div>
      </div>
    </div>
  );
}

/** For editors, at the foot: what was deleted. */
function TrashPlace() {
  const t = useTranslations('wiki.shell');
  const pathname = usePathname();
  const current = pathname === urls.trash;
  return (
    <Link
      href={urls.trash}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors',
        'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
        current ? 'bg-card font-semibold text-ink shadow-xs ring-1 ring-line' : 'font-medium text-ink-muted hover:bg-card/60 hover:text-ink',
      )}
    >
      <Trash size={18} aria-hidden="true" className={cn('shrink-0', current && 'text-accent')} />
      {t('trash')}
    </Link>
  );
}

/** For visitors, at the foot: signing in, which opens the same page inside the suite, the language and the theme. */
function VisitorFoot() {
  const t = useTranslations('wiki.shell');
  const pathname = usePathname();
  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-line pt-3">
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
        className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-ink-muted transition-colors hover:bg-card/60 hover:text-ink focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
      >
        <LogIn size={18} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{t('signIn')}</span>
      </Link>
      <LanguageToggle />
      <ThemeToggle />
    </div>
  );
}
