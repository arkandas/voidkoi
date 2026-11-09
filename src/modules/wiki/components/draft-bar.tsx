'use client';

import { Eye, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { urls } from '@/modules/wiki/lib/api';

/** For editors, over a page: whether what is shown is published, and the way to the draft. */
export function DraftBar({ id, showingDraft, unpublished, hasDraft }: { id: number; showingDraft: boolean; unpublished: boolean; hasDraft: boolean }) {
  const t = useTranslations('wiki.draft');
  const pathname = usePathname();
  if (!unpublished && !hasDraft) return null;

  const link = 'flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50';
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line px-3 py-1.5 text-sm text-ink">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
        {unpublished ? t('notPublished') : showingDraft ? t('showingDraft') : t('hasChanges')}
      </span>
      {hasDraft && !unpublished ? (
        showingDraft ? (
          <Link href={pathname} className={`${link} text-ink-muted hover:text-ink`}>
            <Eye size={14} aria-hidden="true" />
            {t('showPublished')}
          </Link>
        ) : (
          <Link href={`${pathname}?draft=1`} className={`${link} text-ink-muted hover:text-ink`}>
            <Eye size={14} aria-hidden="true" />
            {t('showDraft')}
          </Link>
        )
      ) : null}
      <Link href={urls.edit(id)} className={`${link} text-accent`}>
        <Pencil size={14} aria-hidden="true" />
        {t('edit')}
      </Link>
    </div>
  );
}
