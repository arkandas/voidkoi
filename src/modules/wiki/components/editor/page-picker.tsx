'use client';

import { FileText, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui';
import { useWiki } from '@/modules/wiki/components/wiki-provider';
import { cn } from '@/lib/cn';
import { ancestorIds } from '@/modules/wiki/lib/tree-view';

/** Pick a page of the wiki to link to, by typing part of its title. */
export function PagePicker({ open, except, onClose, onPick }: { open: boolean; except: number; onClose(): void; onPick(title: string, path: string): void }) {
  const t = useTranslations('wiki.editor.picker');
  const { tree } = useWiki();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Opened again: from the start.
  const [shownOpen, setShownOpen] = useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  const titles = useMemo(() => new Map(tree.map(node => [node.id, node.title])), [tree]);
  const pages = useMemo(() => {
    const words = query.trim().toLowerCase();
    return tree
      .filter(node => node.kind === 'page' && node.id !== except && !node.unpublished)
      .filter(node => !words || node.title.toLowerCase().includes(words) || node.path.includes(words))
      .slice(0, 50);
  }, [tree, query, except]);

  const pick = (index: number): void => {
    const page = pages[index];
    if (page) onPick(page.title, page.path);
  };

  return (
    <Modal open={open} label={t('title')} title={t('title')} onClose={onClose} padded={false}>
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search size={17} aria-hidden="true" className="text-ink-faint" />
        <input
          autoFocus
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (pages.length) setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + pages.length) % pages.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              pick(active);
            }
          }}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-hidden"
        />
      </div>
      <ul className="themed-scroll max-h-80 overflow-y-auto p-2">
        {pages.length === 0 ? <li className="px-3 py-8 text-center text-sm text-ink-muted">{t('none')}</li> : null}
        {pages.map((page, index) => {
          const place = ancestorIds(tree, page.id)
            .map(id => titles.get(id) ?? '')
            .join(' / ');
          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => pick(index)}
                onMouseMove={() => setActive(index)}
                className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', index === active ? 'bg-muted' : 'hover:bg-muted/60')}
              >
                <FileText size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{page.title}</span>
                  {place ? <span className="block truncate text-xs text-ink-muted">{place}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
