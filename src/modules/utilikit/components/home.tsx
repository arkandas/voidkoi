'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { AppIcon } from '@/components/brand/mark';
import { PageLayout } from '@/components/layout/page-layout';
import { AppSwitcher } from '@/components/shell/switcher';
import { cn } from '@/lib/cn';
import { SearchField } from '@/modules/utilikit/components/search-field';
import { useToolQuery } from '@/modules/utilikit/components/tool-query';
import { useToolGroups } from '@/modules/utilikit/lib/use-tools';

/** Every tool the account uses, by category, with a search over them. */
export function UtilikitHome() {
  const t = useTranslations('utilikit');
  const [query, setQuery] = useToolQuery();
  const groups = useToolGroups(query);

  return (
    <PageLayout
      className="p-4 pb-16 sm:p-6 sm:pb-16"
      header={
        // The mark and name sit where the other apps' sidebars have theirs.
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-3 pt-[9px] pb-2 sm:px-4">
          {/* As tall as the row the search shares on a wide screen, so the switcher keeps its place when the search wraps below. */}
          <div className="flex min-h-[38px] min-w-0 items-center gap-3">
            <AppSwitcher />
            <div className="flex min-w-0 items-center gap-2.5">
              <AppIcon app="utilikit" size={28} className="hidden rounded-lg lg:block" />
              <h1 className="truncate text-lg font-bold tracking-tight text-ink">{t('app.name')}</h1>
            </div>
          </div>
          <SearchField value={query} onChange={setQuery} className="w-full sm:w-72" />
        </header>
      }
    >
      <div className="mx-auto w-full max-w-6xl">
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-6 py-16 text-center text-ink-muted">
            {t('nav.noResults', { query: query.trim() })}
          </p>
        ) : null}

        <div className="space-y-8">
          {groups.map(group => (
            <section key={group.category} aria-labelledby={`category-${group.category}`}>
              <h2
                id={`category-${group.category}`}
                className="mb-4 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-ink-faint uppercase"
              >
                {group.label}
                <span className="tabular-nums">{group.tools.length}</span>
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.tools.map(tool => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.id}
                      href={tool.path}
                      className="group flex flex-col rounded-xl border border-line bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 focus-visible:outline-hidden"
                    >
                      <span className="flex items-center gap-3">
                        <span className={cn('tool-tile flex size-11 shrink-0 items-center justify-center rounded-lg', tool.color)}>
                          <Icon size={22} aria-hidden="true" />
                        </span>
                        <span className="text-lg leading-tight font-semibold text-ink">{tool.name}</span>
                      </span>
                      <span className="mt-3 text-sm leading-relaxed text-ink-muted">{tool.description}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
