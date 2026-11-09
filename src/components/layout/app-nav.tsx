'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { DOMAttributes, ReactNode } from 'react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

/** One of an app's places, as its sidebar and its phone tab bar show it. */
export interface AppNavItem {
  href: string;
  label: string;
  /** For the phone's tab bar, where a fifth of the width won't hold the full name. */
  short?: string;
  Icon?: LucideIcon;
  /** Instead of `Icon`: a picture of its own, like an app's icon in Settings. */
  icon?: ReactNode;
  /** Something new there, shown as a badge. */
  count?: number;
  /** A count to deal with, like missed calls, rather than one that just waits. */
  urgent?: boolean;
  /** A place things can be dropped on in the sidebar, like Files' My files. */
  drop?: { over: boolean; handlers: Pick<DOMAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> };
}

export function countLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

interface AppNavProps {
  /** Names the navigation for screen readers. */
  label: string;
  items: AppNavItem[];
  /** Whether the page at `pathname` is the place at `href`. */
  isCurrent(pathname: string, href: string): boolean;
}

/** One of an app's parts in its bar across the top. */
export interface BarTab {
  href: string;
  label: string;
  Icon: LucideIcon;
  current: boolean;
}

/** An app's parts as tabs in its bar across the top, as Tasks and Habits have them. Icons only on a phone. */
export function BarTabs({ label, tabs, className }: { label: string; tabs: BarTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn('flex items-center gap-0.5 rounded-lg border border-line bg-muted p-0.5 dark:bg-canvas', className)}>
      {tabs.map(({ href, label: tabLabel, Icon, current }) => (
        <Link
          key={href}
          href={href}
          title={tabLabel}
          aria-label={tabLabel}
          aria-current={current ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors sm:h-8',
            'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
            current ? 'bg-accent font-semibold text-accent-ink shadow-sm' : 'font-medium text-ink-muted hover:bg-surface hover:text-ink',
          )}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{tabLabel}</span>
        </Link>
      ))}
    </nav>
  );
}

/** The column beside the page on a wide screen, where an app keeps its mark, its name and its places. */
export function AppAside({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <aside aria-label={label} className="hidden w-56 shrink-0 flex-col gap-4 border-r border-line px-2.5 pt-2.5 pb-3 lg:flex">
      {children}
    </aside>
  );
}

/** An app's mark and name at the top of its column: the way back to its start. */
export function AppBrand({ href, mark, name, onNavigate }: { href: string; mark: ReactNode; name: string; onNavigate?(): void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-w-0 items-center gap-2.5 self-start rounded-lg px-1.5 py-1 focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
    >
      {mark}
      <span className="truncate text-lg font-bold tracking-tight text-ink">{name}</span>
    </Link>
  );
}

/** An app's places on a wide screen: its mark and name, the places, and whatever the app keeps at the foot. */
export function AppSidebar({
  label,
  items,
  isCurrent,
  home,
  mark,
  name,
  footer,
}: AppNavProps & { home: string; mark: ReactNode; name: string; footer?: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppAside>
      <AppBrand href={home} mark={mark} name={name} />

      <nav aria-label={label} className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-0.5">
          {items.map(({ href, label: itemLabel, Icon, icon, count = 0, urgent, drop }) => {
            const current = isCurrent(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  {...drop?.handlers}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                    'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
                    current ? 'bg-card font-semibold text-ink shadow-xs ring-1 ring-line' : 'font-medium text-ink-muted hover:bg-card/60 hover:text-ink',
                    drop?.over && 'drop-target',
                  )}
                >
                  {icon ?? (Icon ? <Icon size={17} aria-hidden="true" className={cn('shrink-0', current && 'text-accent')} /> : null)}
                  <span className="flex-1">{itemLabel}</span>
                  {count > 0 ? (
                    <Badge count tone={urgent ? 'danger' : 'accent'}>
                      {countLabel(count)}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {footer}
    </AppAside>
  );
}

/** An app's page, filling the window beside its column, with what goes above or below it, like a call in progress or the phone's tab bar. */
export function AppPanel({ children, above, below }: { children: ReactNode; above?: ReactNode; below?: ReactNode }) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      {above}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">{children}</main>
      {below}
    </div>
  );
}

/** The same places along the bottom of a phone, under the thumb. */
export function AppTabBar({ label, items, isCurrent }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex shrink-0 border-t border-line bg-surface pb-safe lg:hidden">
      {items.map(({ href, label: itemLabel, short, Icon, icon, count = 0, urgent }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 focus:outline-hidden focus-visible:bg-muted"
          >
            <span
              className={cn(
                'relative flex h-7 w-14 max-w-full items-center justify-center rounded-full transition-colors',
                current ? 'bg-accent-soft text-accent' : 'text-ink-muted',
              )}
            >
              {icon ?? (Icon ? <Icon size={20} aria-hidden="true" /> : null)}
              {count > 0 ? (
                <Badge count tone={urgent ? 'danger' : 'accent'} className="absolute -top-1 right-1">
                  {countLabel(count)}
                </Badge>
              ) : null}
            </span>
            <span
              aria-hidden={short ? true : undefined}
              className={cn('max-w-full truncate text-[11px] tracking-[-0.01em]', current ? 'font-semibold text-ink' : 'font-medium text-ink-muted')}
            >
              {short ?? itemLabel}
            </span>
            {short ? <span className="sr-only">{itemLabel}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
