import 'katex/dist/katex.min.css';
import '@/modules/wiki/wiki.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { appIcons } from '@/lib/page-title';
import { PublicShell } from '@/modules/wiki/components/wiki-shell';
import { getSettings } from '@/modules/wiki/lib/settings';
import { treeFor } from '@/modules/wiki/lib/tree';
import { wikiContext } from '@/modules/wiki/lib/wiki';

export async function generateMetadata(): Promise<Metadata> {
  const { wiki_name } = await getSettings();
  return { title: { default: wiki_name, template: `%s · ${wiki_name}` }, icons: appIcons('wiki') };
}

/** The wiki for visitors, without the suite around it. The proxy serves it at the pages' own addresses, `/wiki/…`. */
export default async function PublicWikiLayout({ children }: { children: ReactNode }) {
  const { settings, index, reader } = await wikiContext();
  return (
    <div data-app="wiki" className="app-shell flex bg-canvas">
      <PublicShell name={settings.wiki_name} tree={treeFor(index, reader)} homePageId={settings.home_page_id}>
        {children}
      </PublicShell>
    </div>
  );
}
