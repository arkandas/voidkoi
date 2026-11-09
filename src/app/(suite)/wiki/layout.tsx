import 'katex/dist/katex.min.css';
import '@/modules/wiki/wiki.css';

import type { ReactNode } from 'react';

import { requireSuitePage } from '@/lib/app-access';
import { appMetadata } from '@/lib/page-title';
import { WikiShell } from '@/modules/wiki/components/wiki-shell';
import { treeFor } from '@/modules/wiki/lib/tree';
import { wikiContext } from '@/modules/wiki/lib/wiki';

export const generateMetadata = () => appMetadata('wiki');

/**
 * The wiki inside the suite: its tree beside the panel. An account that
 * doesn't use the wiki reads what visitors read, at the same addresses.
 */
export default async function WikiLayout({ children }: { children: ReactNode }) {
  await requireSuitePage();
  const { settings, index, reader } = await wikiContext();
  return (
    <div data-app="wiki" className="flex min-w-0 flex-1">
      <WikiShell name={settings.wiki_name} tree={treeFor(index, reader)} homePageId={settings.home_page_id} canEdit={reader.editor}>
        {children}
      </WikiShell>
    </div>
  );
}
