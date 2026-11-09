'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';

/** The tool search, on the home page and over the tool list. */
export function SearchField({ value, onChange, className }: { value: string; onChange(value: string): void; className?: string }) {
  const t = useTranslations('utilikit.nav');

  return (
    <div className={cn('relative', className)}>
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onChange('');
        }}
        placeholder={t('search')}
        aria-label={t('search')}
        className="h-9 w-full rounded-lg border border-line bg-raised pr-8 pl-9 text-base text-ink outline-hidden transition-colors placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm dark:bg-card [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('clearSearch')}
          title={t('clearSearch')}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-muted hover:text-ink-muted"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
