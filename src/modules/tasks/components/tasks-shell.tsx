'use client';

import { Layout, ListTodo, StickyNote, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AppIcon } from '@/components/brand/mark';
import { AppPanel, BarTabs } from '@/components/layout/app-nav';
import { useMe } from '@/components/me';
import { AppSwitcher } from '@/components/shell/switcher';
import { PARTS, boardHref, partsUsed, type TasksPart } from '@/modules/tasks/lib/routes';

import { TasksProvider, useTasks } from './tasks-context';

const ICONS: Record<TasksPart, LucideIcon> = { boards: Layout, todo: ListTodo, stickies: StickyNote };

/** Tasks inside the suite: its bar with the parts the account uses, and the open part under it. */
export function TasksShell({ children }: { children: ReactNode }) {
  return (
    <TasksProvider>
      <AppPanel>
        <TasksBar />
        <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      </AppPanel>
    </TasksProvider>
  );
}

function TasksBar() {
  const t = useTranslations('tasks');
  const me = useMe();
  const pathname = usePathname();
  const { lastBoard } = useTasks();
  const parts = partsUsed(me.apps);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 pt-px sm:gap-5 sm:px-4">
      <AppSwitcher />
      <Link
        href={PARTS.find(part => part.id === parts[0])?.href ?? '/tasks'}
        className="hidden shrink-0 items-center gap-2.5 rounded-lg focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 lg:flex"
      >
        <AppIcon app="tasks" size={28} className="rounded-lg" />
        <span className="text-lg font-bold tracking-tight text-ink">{t('app.name')}</span>
      </Link>

      <BarTabs
        label={t('nav.label')}
        tabs={PARTS.filter(part => parts.includes(part.id)).map(part => ({
          // Boards goes back to the board open last.
          href: part.id === 'boards' && lastBoard !== null ? boardHref(lastBoard) : part.href,
          label: t(`app.${part.id}`),
          Icon: ICONS[part.id],
          current: pathname === part.href || pathname.startsWith(`${part.href}/`),
        }))}
      />
    </header>
  );
}
