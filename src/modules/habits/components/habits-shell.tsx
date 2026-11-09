'use client'

import { CalendarDays, LayoutGrid, LineChart, Plus, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useState, type ReactNode } from 'react'

import { AppIcon } from '@/components/brand/mark'
import { AppPanel, BarTabs } from '@/components/layout/app-nav'
import { AppSwitcher } from '@/components/shell/switcher'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { isDayKey, type DayKey } from '@/modules/habits/lib/dates'
import { onOpenLog, openLog, type LogRequest } from '@/modules/habits/lib/log'
import { isMetric, type Metric } from '@/modules/habits/lib/metrics'
import { closeDay } from '@/modules/habits/lib/nav'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useToday } from '@/modules/habits/lib/use-today'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { DayPanel } from './day-panel'
import { LogPanel } from './log-panel'
import { useMediaQuery } from '@/lib/use-media-query'

import { Sheet } from './sheet'

interface Place {
  href: string
  key: 'overview' | 'calendar' | 'templates'
  Icon: LucideIcon
}

function usePlaces(): Place[] {
  const tracks = useTracks()
  return [
    { href: '/habits', key: 'overview', Icon: LineChart },
    { href: '/habits/calendar', key: 'calendar', Icon: CalendarDays },
    ...(tracks.templates ? [{ href: '/habits/templates', key: 'templates', Icon: LayoutGrid } as const] : []),
  ]
}

const isCurrent = (pathname: string, href: string) => (href === '/habits' ? pathname === href : pathname.startsWith(href))

/** The calendar keeps an open day beside it where the grid still has room for its chips. */
const DOCK_QUERY = '(min-width: 86rem)'
const isCalendar = (pathname: string) => pathname === '/habits/calendar'

/** Habits' bar: its mark and name, its places, today's date and the Log button. */
function Header() {
  const t = useTranslations('habits.nav')
  const tApp = useTranslations('habits.app')
  const pathname = usePathname()
  const places = usePlaces()
  const today = useToday()
  const f = useFormat()
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 pt-px sm:gap-5 sm:px-4">
      <AppSwitcher />
      <Link
        href="/habits"
        className="hidden shrink-0 items-center gap-2.5 rounded-lg focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 lg:flex"
      >
        <AppIcon app="habits" size={28} className="rounded-lg" />
        <span className="text-lg font-bold tracking-tight text-ink">{tApp('name')}</span>
      </Link>
      <span className="truncate text-lg font-bold tracking-tight text-ink md:hidden">{tApp('name')}</span>
      <BarTabs
        label={t('label')}
        className="hidden md:flex"
        tabs={places.map(({ href, key, Icon }) => ({ href, label: t(key), Icon, current: isCurrent(pathname, href) }))}
      />
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {today ? <span className="hidden text-sm text-ink-muted lg:inline">{f.title(f.date(today, 'shortDate'))}</span> : null}
        <Button data-log-anchor icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => openLog()} aria-keyshortcuts="L">
          {t('log')}
        </Button>
      </div>
    </header>
  )
}

/** Habits' places along the bottom of a phone. */
function TabBar() {
  const t = useTranslations('habits.nav')
  const pathname = usePathname()
  const places = usePlaces()
  return (
    <nav aria-label={t('label')} className="flex shrink-0 border-t border-line bg-surface pb-safe md:hidden">
      {places.map(({ href, key, Icon }) => {
        const current = isCurrent(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 focus:outline-hidden focus-visible:bg-muted"
          >
            <span
              className={cn(
                'flex h-7 w-14 max-w-full items-center justify-center rounded-full transition-colors',
                current ? 'bg-accent-soft text-accent' : 'text-ink-muted',
              )}
            >
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className={cn('max-w-full truncate text-[11px] tracking-[-0.01em]', current ? 'font-semibold text-ink' : 'font-medium text-ink-muted')}>
              {t(key)}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

/** The Log panel: from the header's button, a card's, or the L key. */
function LogHost() {
  const t = useTranslations('habits.nav')
  const tracks = useTracks()
  const [request, setRequest] = useState<(LogRequest & { at: number }) | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(
    () =>
      onOpenLog(next => {
        setRequest({ ...next, at: Date.now() })
        setOpen(true)
      }),
    [],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (document.querySelector('[role=dialog], dialog[open]')) return
      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault()
        openLog()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const tab = request?.tab && tracks[request.tab] ? request.tab : tracks.list[0]
  return (
    <Sheet open={open} onClose={() => setOpen(false)} variant="popover" label={t('log')}>
      {request && tab ? <LogPanel key={request.at} tab={tab} onClose={() => setOpen(false)} /> : null}
    </Sheet>
  )
}

/** The day open from the address: beside the calendar on a wide screen, in a sheet everywhere else. */
function DayHost() {
  const params = useSearchParams()
  const pathname = usePathname()
  const tracks = useTracks()
  const dayParam = params.get('day')
  const tabParam = params.get('tab')
  const day = isDayKey(dayParam) ? dayParam : null
  const tab: Metric = isMetric(tabParam) && tracks[tabParam] ? tabParam : tracks.list[0]!
  const [shown, setShown] = useState<DayKey | null>(day)
  if (day && day !== shown) setShown(day)
  const docked = useMediaQuery(DOCK_QUERY) && isCalendar(pathname)

  useEffect(() => {
    if (!docked || !day) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"], dialog[open]')) closeDay()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [docked, day])

  if (docked) {
    return day ? (
      <aside
        aria-labelledby="day-panel-title"
        className="flex w-[25rem] shrink-0 animate-[habits-drawer-in_.22s_cubic-bezier(.16,1,.3,1)] flex-col overflow-hidden border-l border-line bg-surface"
      >
        <DayPanel day={day} tab={tab} onClose={closeDay} />
      </aside>
    ) : null
  }
  return (
    <Sheet open={!!day} onClose={closeDay} labelledBy="day-panel-title">
      {shown ? <DayPanel day={shown} tab={tab} onClose={closeDay} /> : null}
    </Sheet>
  )
}

/** Habits inside the suite: its bar, the open page, its places under it on a phone, the Log panel and the open day. */
export function HabitsShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppPanel below={<TabBar />}>
        <Header />
        <div className="flex min-h-0 flex-1">
          <div id="habits-scroll" className="themed-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
          <Suspense fallback={null}>
            <DayHost />
          </Suspense>
        </div>
      </AppPanel>
      <LogHost />
    </>
  )
}
