import { FileText, Folder, KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { urls } from '@/modules/wiki/lib/api';
import { cn } from '@/lib/cn';
import type { Card } from '@/modules/wiki/lib/views';

/** What a folder holds, a card each: a page with its first words, a folder with how much is in it. */
export async function Cards({ cards }: { cards: Card[] }) {
  const t = await getTranslations('wiki.folder');
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {cards.map(card => {
        const Icon = card.locked ? KeyRound : card.kind === 'folder' ? Folder : FileText;
        return (
          <li key={card.id}>
            <Link
              href={urls.page(card.path)}
              className="group flex h-full gap-3.5 rounded-xl border border-line bg-card p-5 shadow-xs transition-colors hover:border-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Icon size={20} aria-hidden="true" className={cn('mt-0.5 shrink-0', card.kind === 'folder' ? 'text-accent' : 'text-ink-faint')} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className={cn('truncate text-[17px] font-semibold text-ink transition-colors group-hover:text-accent', card.unpublished && 'italic')}>
                    {card.title || t('untitled')}
                  </span>
                  {card.unpublished ? <span className="shrink-0 text-xs text-ink-faint">{t('draft')}</span> : null}
                </span>
                {card.kind === 'folder' ? (
                  <span className="text-[15px] text-ink-muted">{t('count', { count: card.count })}</span>
                ) : card.summary ? (
                  <span className="line-clamp-2 text-[15px] leading-relaxed text-ink-muted">{card.summary}</span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
