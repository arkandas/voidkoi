'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import type { TocItem } from '@/modules/wiki/lib/markdown/render';

/** How far below the top of the page a heading counts as the one being read. */
const READING_LINE = 120;

/** The section being read: the last heading above the reading line. */
function useActive(items: TocItem[]): string | null {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const scroller = document.getElementById('page-scroll');
    if (!scroller || items.length === 0) return;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top + READING_LINE;
      let current: string | null = items[0]!.id;
      for (const item of items) {
        const heading = document.getElementById(item.id);
        if (heading && heading.getBoundingClientRect().top <= top) current = item.id;
      }
      // At the very bottom, the last section is the one being read even when it's short.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = items.at(-1)!.id;
      setActive(current);
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  return active;
}

function Links({ items, active, onPick }: { items: TocItem[]; active: string | null; onPick?(): void }) {
  return (
    <ul className="text-[13.5px] leading-snug">
      {items.map(item => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            onClick={onPick}
            aria-current={item.id === active ? 'location' : undefined}
            className={cn(
              'block py-1 transition-colors focus:outline-hidden focus-visible:underline',
              item.depth === 3 && 'pl-3.5',
              item.id === active ? 'font-medium text-accent' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "On this page": a page's sections beside it, the one being read marked. */
export function Toc({ items }: { items: TocItem[] }) {
  const t = useTranslations('wiki.page');
  const active = useActive(items);
  if (items.length === 0) return null;
  return (
    <nav aria-label={t('onThisPage')} className="themed-scroll sticky top-6 max-h-[calc(100dvh-8rem)] overflow-y-auto pt-1">
      <p className="mb-1.5 text-[13.5px] font-semibold text-ink">{t('onThisPage')}</p>
      <Links items={items} active={active} />
    </nav>
  );
}

/** The same list folded into the top of the page, where there's no room beside it. */
export function TocDropdown({ items }: { items: TocItem[] }) {
  const t = useTranslations('wiki.page');
  const active = useActive(items);
  const [open, setOpen] = useState(false);
  if (items.length < 2) return null;
  return (
    <div className="mb-6 rounded-md border border-line xl:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-ink"
      >
        {t('onThisPage')}
        <ChevronDown size={16} aria-hidden="true" className={cn('text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="border-t border-line px-4 py-2">
          <Links items={items} active={active} onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
