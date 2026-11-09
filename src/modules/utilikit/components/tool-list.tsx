'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { SearchField } from '@/modules/utilikit/components/search-field';
import { useToolQuery } from '@/modules/utilikit/components/tool-query';
import { useToolGroups } from '@/modules/utilikit/lib/use-tools';

/** Every tool the account uses, by category, with a search over them: the sidebar, and the drawer on a phone. */
export function ToolList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('utilikit.nav');
  const pathname = usePathname();
  const [query, setQuery] = useToolQuery();
  const groups = useToolGroups(query);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SearchField value={query} onChange={setQuery} className="shrink-0" />

      <nav aria-label={t('tools')} className="themed-scroll -mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
        {groups.length === 0 ? <p className="px-1 py-6 text-center text-sm text-ink-muted">{t('noResults', { query: query.trim() })}</p> : null}

        {groups.map(group => (
          <div key={group.category}>
            <h2 className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">{group.label}</h2>
            <ul className="flex flex-col gap-0.5">
              {group.tools.map(tool => {
                const current = pathname === tool.path;
                const Icon = tool.icon;
                return (
                  <li key={tool.id}>
                    <Link
                      href={tool.path}
                      onClick={onNavigate}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                        'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
                        current
                          ? 'bg-card font-semibold text-ink shadow-xs ring-1 ring-line'
                          : 'font-medium text-ink-muted hover:bg-card/60 hover:text-ink',
                      )}
                    >
                      <Icon size={16} aria-hidden="true" className={cn('tool-icon shrink-0', tool.color)} />
                      <span className="min-w-0 leading-snug">{tool.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
