'use client';

import { ChevronLeft, ChevronRight, Download, List, Loader2, Minus, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { ViewerSource } from '@/modules/files/components/viewer';
import { Button } from '@/components/ui';
import { download } from '@/modules/files/lib/api';
import type { ItemDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';

import { PlayerButton } from './controls';

type Book = import('epubjs').Book;
type Rendition = import('epubjs').Rendition;
type NavItem = import('epubjs').NavItem;

const SIZES = [80, 90, 100, 110, 120, 135, 150, 170];

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse: the place just isn't kept.
  }
}

/** The page colours, light or dark like the app. */
function pageTheme(dark: boolean) {
  return dark
    ? { background: '#171c1f', color: '#e3e8ea', link: '#5ccbe0' }
    : { background: '#fbfaf6', color: '#1d2427', link: '#0e7490' };
}

/** Whether a book's page runs the reader's own listeners. Safari runs none in a page whose scripts are off. */
function hears(doc: Document): boolean {
  let heard = false;
  const listener = () => {
    heard = true;
  };
  doc.addEventListener('files-probe', listener);
  doc.dispatchEvent(new Event('files-probe'));
  doc.removeEventListener('files-probe', listener);
  return heard;
}

/**
 * A book, a page or two at a time. Arrows and the buttons below turn the
 * pages, a swipe does on touch screens, and the place and text size are kept
 * for next time. Scripts in a book never run.
 */
export function EpubReader({ item, source }: { item: ItemDto; source: ViewerSource }) {
  const t = useTranslations('files.reader');
  const tCommon = useTranslations('common');
  const box = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [size, setSize] = useState(() => Number(stored('files-book-size')) || 100);
  const [dark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const placeKey = `files-book-${item.id}`;

  useEffect(() => {
    let book: Book | null = null;
    let cancelled = false;
    const element = page.current;
    const surface = element?.parentElement;
    if (!element || !surface) return;

    // A swipe turns the page, in the book's pages or around them.
    let swipeFrom: number | null = null;
    const swipeStart = (x: number | undefined) => {
      swipeFrom = x ?? null;
    };
    const swipeEnd = (x: number | undefined) => {
      const from = swipeFrom;
      swipeFrom = null;
      if (from === null || x === undefined || Math.abs(x - from) < 40) return;
      if (x < from) void rendition.current?.next();
      else void rendition.current?.prev();
    };
    const onTouchStart = (event: TouchEvent) => swipeStart(event.changedTouches[0]?.clientX);
    const onTouchEnd = (event: TouchEvent) => swipeEnd(event.changedTouches[0]?.clientX);
    surface.addEventListener('touchstart', onTouchStart, { passive: true });
    surface.addEventListener('touchend', onTouchEnd, { passive: true });

    void (async () => {
      try {
        const [{ default: ePub }, response] = await Promise.all([import('epubjs'), fetch(source.content(item))]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (cancelled) return;
        book = ePub(data);
        const view = book.renderTo(element, { width: '100%', height: '100%', flow: 'paginated', spread: 'auto', allowScriptedContent: false });
        rendition.current = view;
        const colours = pageTheme(dark);
        view.themes.default({
          body: { background: `${colours.background} !important`, color: `${colours.color} !important` },
          a: { color: `${colours.link} !important` },
        });
        view.themes.fontSize(`${size}%`);

        view.on('relocated', (location: { start: { cfi: string; percentage?: number } }) => {
          store(placeKey, location.start.cfi);
          const located = book?.locations.length() ? book.locations.percentageFromCfi(location.start.cfi) : null;
          if (located !== null && Number.isFinite(located)) setPercent(Math.round(located * 100));
        });

        // Keys and swipes inside the book's pages, which are a frame of their own.
        view.on('keydown', (event: globalThis.KeyboardEvent) => {
          if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') void view.next();
          if (event.key === 'ArrowLeft' || event.key === 'PageUp') void view.prev();
          // The viewer doesn't hear keys in here: Escape still closes it.
          if (event.key === 'Escape') box.current?.closest('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
        });
        view.on('touchstart', onTouchStart);
        view.on('touchend', onTouchEnd);
        // Where the pages hear nothing, they take no clicks either: those reach the reader, and so do keys and swipes.
        let deaf: boolean | null = null;
        view.on('rendered', (_section: unknown, shown: { iframe?: HTMLIFrameElement }) => {
          const frame = shown.iframe;
          if (!frame?.contentDocument) return;
          deaf ??= !hears(frame.contentDocument);
          if (deaf) frame.style.pointerEvents = 'none';
        });

        const place = stored(placeKey);
        try {
          await view.display(place ?? undefined);
        } catch {
          // The book changed since: from the start.
          await view.display();
        }
        if (cancelled) return;
        setLoading(false);
        box.current?.focus();
        const navigation = await book.loaded.navigation;
        if (!cancelled) setToc(navigation.toc);
        // Where in the book, as a percentage: worked out after the first page shows.
        await book.locations.generate(1600);
        const where = view.location?.start?.cfi;
        if (!cancelled && where) setPercent(Math.round(book.locations.percentageFromCfi(where) * 100));
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchend', onTouchEnd);
      rendition.current = null;
      book?.destroy();
    };
    // A new book only when the file changes; size and theme are set on the open book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.updatedAt]);

  const resize = (step: number) => {
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + step))] ?? 100;
    setSize(next);
    store('files-book-size', String(next));
    rendition.current?.themes.fontSize(`${next}%`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const turn = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[event.key];
    if (!turn || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    // Not the viewer's: the arrows here turn pages, not to the next file.
    event.stopPropagation();
    if (turn > 0) void rendition.current?.next();
    else void rendition.current?.prev();
  };

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4 text-center text-stage-ink">
        <p className="font-semibold">{t('cantOpen')}</p>
        <Button onClick={() => download(source.content(item, true))} icon={<Download size={16} />}>
          {t('download')}
        </Button>
      </div>
    );
  }

  const colours = pageTheme(dark);

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKeyDown} className="relative flex size-full max-w-5xl flex-col focus:outline-hidden">
      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden rounded-xl shadow-2xl', dark && 'ring-1 ring-white/10')}
        style={{ background: colours.background }}
      >
        <div ref={page} className="absolute inset-0 px-4 py-6 sm:px-10 sm:py-8" />
        {loading ? (
          <span className="absolute inset-0 flex items-center justify-center" style={{ background: colours.background }}>
            <Loader2 size={30} className="animate-spin" style={{ color: colours.color, opacity: 0.6 }} />
          </span>
        ) : null}

        {showToc ? (
          <nav
            aria-label={t('contents')}
            className="absolute inset-y-0 left-0 z-10 flex w-full max-w-sm flex-col border-r border-white/10 bg-stage/97 text-stage-ink shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <p className="font-semibold">{t('contents')}</p>
              <PlayerButton label={tCommon('close')} onClick={() => setShowToc(false)} className="size-9">
                <X size={18} />
              </PlayerButton>
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <TocEntries
                entries={toc}
                depth={0}
                onPick={href => {
                  void rendition.current?.display(href);
                  setShowToc(false);
                  box.current?.focus();
                }}
              />
            </ol>
          </nav>
        ) : null}
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-1 text-stage-ink">
        <PlayerButton label={t('contents')} onClick={() => setShowToc(value => !value)} disabled={toc.length === 0}>
          <List size={19} />
        </PlayerButton>
        <PlayerButton label={t('smallerText')} onClick={() => resize(-1)} disabled={size === SIZES[0]}>
          <Minus size={18} />
        </PlayerButton>
        <PlayerButton label={t('largerText')} onClick={() => resize(1)} disabled={size === SIZES[SIZES.length - 1]}>
          <Plus size={18} />
        </PlayerButton>
        <span className="flex-1 text-center text-sm tabular-nums text-stage-ink-muted">
          {percent !== null ? t('progress', { percent }) : ''}
        </span>
        <PlayerButton label={t('previousPage')} onClick={() => void rendition.current?.prev()}>
          <ChevronLeft size={22} />
        </PlayerButton>
        <PlayerButton label={t('nextPage')} onClick={() => void rendition.current?.next()}>
          <ChevronRight size={22} />
        </PlayerButton>
      </div>
    </div>
  );
}

function TocEntries({ entries, depth, onPick }: { entries: NavItem[]; depth: number; onPick(href: string): void }) {
  return (
    <>
      {entries.map(entry => (
        <li key={entry.id || entry.href}>
          <button
            type="button"
            onClick={() => onPick(entry.href)}
            style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            className={cn(
              'w-full rounded-lg py-2 pr-3 text-left text-sm transition-colors hover:bg-white/10',
              depth === 0 ? 'font-medium text-stage-ink' : 'text-stage-ink-muted',
            )}
          >
            {entry.label.trim()}
          </button>
          {entry.subitems?.length ? (
            <ol>
              <TocEntries entries={entry.subitems} depth={depth + 1} onPick={onPick} />
            </ol>
          ) : null}
        </li>
      ))}
    </>
  );
}
