'use client';

import { FileText, Folder, KeyRound, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { api, urls } from '@/modules/wiki/lib/api';
import type { SearchResult } from '@/modules/wiki/lib/api-types';
import { cn } from '@/lib/cn';
import { ancestorIds } from '@/modules/wiki/lib/tree-view';

import { useWiki } from './wiki-provider';

/** A snippet's match sits between ‹ and ›: drawn highlighted. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/[‹›]/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-[3px] bg-warning/25 font-semibold text-ink">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

/** Find pages by their title or their words, as you type. ⌘K opens it from anywhere. */
export function SearchDialog() {
  const t = useTranslations('wiki.search');
  const { searchOpen, closeSearch, tree } = useWiki();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  // The last answer, and the words it was for: it stays on show while the next one loads.
  const [found, setFound] = useState<{ words: string; results: SearchResult[] } | null>(null);
  const [active, setActive] = useState(0);
  const words = query.trim();
  const results = words ? (found?.results ?? null) : null;
  const loading = words !== '' && found?.words !== words;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (searchOpen && !element.open) {
      element.showModal();
      input.current?.select();
    }
    if (!searchOpen && element.open) element.close();
  }, [searchOpen]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onCancel = (event: Event): void => {
      event.preventDefault();
      closeSearch();
    };
    element.addEventListener('cancel', onCancel);
    return () => element.removeEventListener('cancel', onCancel);
  }, [closeSearch]);

  useEffect(() => {
    if (!words) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(words, controller.signal)
        .then(list => {
          setFound({ words, results: list });
          setActive(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFound({ words, results: [] });
        });
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [words]);

  // Where each result is: the titles of the folders above it.
  const titles = useMemo(() => new Map(tree.map(node => [node.id, node.title])), [tree]);
  const placeOf = (id: number): string =>
    ancestorIds(tree, id)
      .map(ancestor => titles.get(ancestor) ?? '')
      .join(' / ');

  const go = (result: SearchResult): void => {
    closeSearch();
    setQuery('');
    router.push(urls.page(result.path));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!results?.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      list.current?.querySelectorAll('li')[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) go(chosen);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-label={t('label')}
      className="mx-auto mt-[12vh] mb-auto w-full max-w-xl p-4"
      onClick={event => {
        if (event.target === dialog.current) closeSearch();
      }}
    >
      <div className="flex max-h-[70dvh] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          {loading ? (
            <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-ink-faint" />
          ) : (
            <Search size={18} aria-hidden="true" className="shrink-0 text-ink-faint" />
          )}
          <input
            ref={input}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('placeholder')}
            aria-label={t('label')}
            role="combobox"
            aria-expanded={!!results?.length}
            aria-controls="search-results"
            aria-activedescendant={results?.length ? `search-result-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-hidden"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-faint sm:inline">Esc</kbd>
        </div>

        {results !== null ? (
          results.length === 0 ? (
            <p className="px-5 py-10 text-center text-ink-muted">{loading ? t('searching') : t('none', { query: query.trim() })}</p>
          ) : (
            <ul ref={list} id="search-results" role="listbox" className="themed-scroll min-h-0 overflow-y-auto p-2">
              {results.map((result, index) => {
                const place = placeOf(result.id);
                const Icon = result.locked ? KeyRound : result.kind === 'folder' ? Folder : FileText;
                return (
                  <li key={result.id} id={`search-result-${index}`} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      onClick={() => go(result)}
                      onMouseMove={() => setActive(index)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                        index === active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{result.title || t('untitled')}</span>
                        {place ? <span className="block truncate text-xs text-ink-muted">{place}</span> : null}
                        {result.snippet ? (
                          <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-ink-muted">
                            <Snippet text={result.snippet} />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </dialog>
  );
}
