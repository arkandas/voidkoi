import type { ReactNode } from 'react';

import { AppSwitcher } from '@/components/shell/switcher';
import { cn } from '@/lib/cn';

/** A page inside the main panel: its header across the top, and under it a column that scrolls by itself. */
export function PageLayout({
  header,
  children,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={cn('p-3 pb-40 sm:p-4 sm:pb-40', className)}>{children}</div>
      </div>
    </div>
  );
}

/** A lucide icon on the accent tile: the mark of Settings and Admin in their sidebars. */
export function IconTile({ children, size = 32 }: { children: ReactNode; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-xs"
    >
      {children}
    </span>
  );
}

export interface PageHeaderProps {
  /** Before the title, like the button that opens a list on a phone. */
  lead?: ReactNode;
  /** A lucide icon beside the title, in the accent colour. */
  icon?: ReactNode;
  /** Instead of `icon`: the page's own mark as it is, like an app's icon. 32px. */
  mark?: ReactNode;
  title: string;
  /** Instead of the title, on screen: like the path to a page. The title stays for screen readers. */
  heading?: ReactNode;
  /** A line under the title. */
  subtitle?: ReactNode;
  /** Beside the title on the same line, on wider screens: a short note like a board's description. */
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** False on pages outside the suite, like the wiki's public pages: there is no account to switch apps with. */
  switcher?: boolean;
}

/**
 * The first row is centred 28px from the top, the line every app's mark sits
 * on, and keeps its height when the actions wrap below it. The phone's app
 * switcher stays in that row when a subtitle makes the title two lines tall.
 */
export function PageHeader({ lead, icon, mark, title, heading, subtitle, detail, action, className, switcher = true }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-3 pt-[7px] pb-1.5 sm:px-4 lg:px-5',
        className,
      )}
    >
      <div className={cn('flex min-h-[42px] min-w-0 items-center gap-3', detail && 'flex-1')}>
        {switcher ? <AppSwitcher className="flex h-[42px] items-center self-start" /> : null}
        {lead}
        {mark || icon ? <span className="hidden shrink-0 text-accent lg:flex">{mark ?? icon}</span> : null}
        <div className="min-w-0">
          {heading ? (
            <>
              <h1 className="sr-only">{title}</h1>
              {heading}
            </>
          ) : (
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">{title}</h1>
          )}
          {subtitle ? <div className="truncate text-sm text-ink-muted">{subtitle}</div> : null}
        </div>
        {detail ? <div className="hidden min-w-0 flex-1 truncate text-sm text-ink-muted sm:block">{detail}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
