'use client'

import { ChevronLeft, ChevronRight, Footprints, RefreshCw, Scale, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type ReactNode } from 'react'

import { Button, Spinner } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dayDate } from '@/lib/days'
import { hasAny, type DayAgg } from '@/modules/habits/lib/aggregate'
import type { Workout } from '@/modules/habits/lib/api-types'
import { bumpData, useRange } from '@/modules/habits/lib/data'
import { isDayKey, isMonthKey, monthGrid, monthKey, weekKeys, type DayKey } from '@/modules/habits/lib/dates'
import type { Metric } from '@/modules/habits/lib/metrics'
import { openDay, setMonthParam } from '@/modules/habits/lib/nav'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useToday } from '@/modules/habits/lib/use-today'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { Num, Skeleton, toneClass, type Tone } from './bits'
import { useMediaQuery } from '@/lib/use-media-query'

const REFERENCE_WEEK = weekKeys('2024-01-01')

const METRIC: Record<Metric, { Icon: LucideIcon; tone: Tone }> = {
  weight: { Icon: Scale, tone: 'weight' },
  food: { Icon: UtensilsCrossed, tone: 'food' },
  training: { Icon: Footprints, tone: 'exercise' },
}
const MAX_CHIPS = 3

/** What a day holds, for what the account tracks: only those count. */
function tracked(day: DayAgg | undefined, on: Record<Metric, boolean>) {
  return {
    weight: on.weight && day?.weight != null,
    food: on.food && !!day?.foodCount,
    training: on.training && !!day?.sessions,
  }
}

function useDescribe() {
  const t = useTranslations('habits.calendar')
  const f = useFormat()
  return (day: DayAgg | undefined, workouts: Workout[] = []) => {
    if (!day || !hasAny(day)) return t('nothingLogged')
    const parts = []
    if (day.weight != null) parts.push(`${f.kg(day.weight)} kg`)
    if (day.foodCount) parts.push(`${f.int(day.kcal)} kcal`)
    for (const w of workouts) parts.push(`${w.name}, ${f.duration(w.minutes)}`)
    return parts.join(', ')
  }
}

interface Summary {
  logged: number
  of: number
  lastWeight: number | null
  wLast: DayKey | null
  kcal: number
  foodDays: number
  minutes: number
  sessions: number
}

/** A month of weigh-ins, food and workouts: a grid of chips on a wide screen, of dots with the chosen day under it on a phone. */
export function Calendar() {
  const t = useTranslations('habits.calendar')
  const tShared = useTranslations('common')
  const f = useFormat()
  const describe = useDescribe()
  const today = useToday()
  const tracks = useTracks()
  const params = useSearchParams()
  const monthParam = params.get('month')
  const dayParam = params.get('day')
  const openKey = isDayKey(dayParam) ? dayParam : null
  const wide = useMediaQuery('(min-width: 48rem)')

  const month = useMemo(() => {
    if (isMonthKey(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number)
      return new Date(y!, m! - 1, 1)
    }
    if (!today) return null
    const date = dayDate(today)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }, [monthParam, today])

  const grid = useMemo(() => (month ? monthGrid(month) : []), [month])
  const { data, loading, failed } = useRange(grid[0] ?? null, grid.at(-1) ?? null)
  const days = data?.days ?? {}
  const workouts = useMemo(() => {
    const by: Record<DayKey, Workout[]> = {}
    for (const w of data?.workouts ?? []) (by[w.date] ??= []).push(w)
    return by
  }, [data])

  const [dir, setDir] = useState(0)
  const [selected, setSelected] = useState<DayKey | null>(null)

  if (!month || !today) return <CalendarSkeleton />

  const mKey = monthKey(month)
  const inMonth = (day: DayKey) => day.startsWith(mKey)
  const isCurrentMonth = today.startsWith(mKey)
  const sel = selected?.startsWith(mKey) ? selected : isCurrentMonth ? today : `${mKey}-01`

  const go = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setDir(delta)
    setMonthParam(today.startsWith(monthKey(next)) ? null : monthKey(next))
  }
  const goToday = () => {
    setDir(today < mKey ? -1 : 1)
    setMonthParam(null)
    setSelected(today)
  }

  const monthDays = grid.filter(day => inMonth(day) && day <= today)
  const on = (day: DayKey) => tracked(days[day], tracks)
  const logged = monthDays.filter(day => Object.values(on(day)).some(Boolean)).length
  const wKeys = monthDays.filter(day => days[day]?.weight != null)
  const wLast = wKeys.at(-1) ?? null
  const fKeys = monthDays.filter(day => days[day]?.foodCount)
  const summary: Summary = {
    logged,
    of: monthDays.length,
    lastWeight: wLast ? days[wLast]!.weight! : null,
    wLast,
    kcal: fKeys.reduce((sum, day) => sum + days[day]!.kcal, 0),
    foodDays: fKeys.length,
    minutes: monthDays.reduce((sum, day) => sum + (days[day]?.minutes ?? 0), 0),
    sessions: monthDays.reduce((sum, day) => sum + (days[day]?.sessions ?? 0), 0),
  }

  const weeks = grid.length / 7
  const anim =
    dir > 0
      ? 'animate-[habits-slide-from-right_.28s_cubic-bezier(.16,1,.3,1)]'
      : dir < 0
        ? 'animate-[habits-slide-from-left_.28s_cubic-bezier(.16,1,.3,1)]'
        : ''
  const title = (
    <h1 className="text-[24px] leading-none font-bold tracking-[-0.015em] whitespace-nowrap text-ink md:text-[28px]">
      {f.title(f.date(month, 'monthLong'))} <span className="font-normal text-ink-muted">{month.getFullYear()}</span>
    </h1>
  )
  const status = failed ? (
    <button type="button" onClick={bumpData} className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
      <RefreshCw size={14} strokeWidth={3} /> {t('loadError')}
    </button>
  ) : loading ? (
    <Spinner size={18} label={tShared('loading')} />
  ) : null
  const nav = <MonthNav onPrev={() => go(-1)} onToday={goToday} onNext={() => go(1)} isCurrent={isCurrentMonth} />

  if (!wide) {
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title}
          <div className="ml-auto flex items-center gap-2">
            {status}
            {nav}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-card shadow-xs">
          <div className="grid grid-cols-7 pt-2.5 text-center text-xs font-medium" aria-hidden="true">
            {REFERENCE_WEEK.map((day, i) => (
              <div key={day} className={i > 4 ? 'text-ink-faint' : 'text-ink-muted'}>
                {f.title(f.date(day, 'weekdayNarrow'))}
              </div>
            ))}
          </div>
          <SwipeArea onSwipe={go}>
            <div key={mKey} className={cn('grid grid-cols-7 gap-y-1.5 px-1 pt-2 pb-3', anim)}>
              {grid.map(day => {
                const isSel = day === sel
                const inside = inMonth(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      if (!inside) {
                        setDir(day < mKey ? -1 : 1)
                        setMonthParam(today.startsWith(day.slice(0, 7)) ? null : day.slice(0, 7))
                      }
                      if (isSel && inside) openDay(day)
                      setSelected(day)
                    }}
                    aria-label={`${f.date(day, 'longDate')}: ${describe(days[day], workouts[day])}`}
                    aria-pressed={isSel}
                    className={cn('flex flex-col items-center gap-1', !inside && 'opacity-40')}
                  >
                    <Bubble day={dayDate(day).getDate()} today={day === today} selected={isSel} />
                    {day <= today ? <Dots on={on(day)} /> : <span className="h-1.5" />}
                  </button>
                )
              })}
            </div>
          </SwipeArea>
          <Legend className="justify-center border-t border-line px-3 py-2.5" />
        </div>

        <SelectedDay day={sel} agg={days[sel]} today={today} />
        <MonthSummary className="mt-4" summary={summary} month={month} isCurrent={isCurrentMonth} />
      </div>
    )
  }

  return (
    <div className="flex min-h-full w-full flex-col px-6 pt-5 pb-4 [container-type:inline-size] xl:px-8">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {title}
        {status}
        <div className="ml-auto">{nav}</div>
      </div>
      <MonthLine summary={summary} />
      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-card shadow-xs">
        <div className="grid grid-cols-7 border-b border-line" aria-hidden="true">
          {REFERENCE_WEEK.map((day, i) => (
            <div key={day} className={cn('px-2.5 py-2 text-right text-[12.5px] font-medium', i > 4 ? 'bg-(--weekend) text-ink-faint' : 'text-ink-muted')}>
              {f.title(f.date(day, 'weekdayShort'))}
            </div>
          ))}
        </div>
        <div
          key={mKey}
          className={cn('grid grid-cols-7', anim)}
          style={{
            gridTemplateRows: `repeat(${weeks}, minmax(min-content, min(calc(100cqw / 7 / 1.25), calc((100dvh - var(--calendar-chrome)) / ${weeks}))))`,
          }}
        >
          {grid.map((day, i) => {
            const isOpen = day === openKey
            return (
              <button
                key={day}
                type="button"
                onClick={() => openDay(day)}
                aria-label={`${f.date(day, 'longDate')}: ${describe(days[day], workouts[day])}`}
                className={cn(
                  'flex min-w-0 flex-col gap-0.5 px-1.5 pt-1 pb-1.5 text-left transition-colors',
                  i % 7 !== 6 && 'border-r border-line',
                  i < grid.length - 7 && 'border-b border-line',
                  isOpen ? 'bg-accent-soft' : i % 7 > 4 ? 'bg-(--weekend) hover:bg-muted' : 'hover:bg-muted',
                )}
              >
                <DateLabel day={day} inMonth={inMonth(day)} today={day === today} open={isOpen} />
                <Chips agg={days[day]} workouts={workouts[day]} dim={!inMonth(day)} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthNav({ onPrev, onToday, onNext, isCurrent }: { onPrev: () => void; onToday: () => void; onNext: () => void; isCurrent: boolean }) {
  const t = useTranslations('habits.calendar')
  const tCommon = useTranslations('habits.common')
  return (
    <div className="inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-line-strong bg-raised text-[13px] font-medium text-ink shadow-xs sm:h-8 dark:bg-card">
      <button type="button" onClick={onPrev} aria-label={t('previousMonth')} className="grid w-9 place-items-center hover:bg-muted sm:w-8">
        <ChevronLeft size={16} strokeWidth={2.25} />
      </button>
      <button type="button" onClick={onToday} disabled={isCurrent} className="border-x border-line px-3 hover:bg-muted disabled:text-ink-faint disabled:hover:bg-transparent">
        {tCommon('today')}
      </button>
      <button type="button" onClick={onNext} aria-label={t('nextMonth')} className="grid w-9 place-items-center hover:bg-muted sm:w-8">
        <ChevronRight size={16} strokeWidth={2.25} />
      </button>
    </div>
  )
}

function MonthLine({ summary: s }: { summary: Summary }) {
  const t = useTranslations('habits.calendar.line')
  const f = useFormat()
  const tracks = useTracks()
  const ink = (tone: Tone) =>
    function Value(chunks: ReactNode) {
      return <span className={cn(toneClass(tone), 'text-(--tone-ink)')}>{chunks}</span>
    }
  const parts: ReactNode[] = [t.rich('logged', { logged: s.logged, total: s.of, v: chunks => <span className="text-ink">{chunks}</span> })]
  if (tracks.weight && s.lastWeight != null && s.wLast)
    parts.push(t.rich('lastWeighIn', { kg: f.kg(s.lastWeight), date: f.date(s.wLast, 'monthDay'), v: ink('weight') }))
  if (tracks.food && s.kcal) parts.push(t.rich('food', { kcal: f.int(s.kcal), days: s.foodDays, v: ink('food') }))
  if (tracks.training && s.minutes) parts.push(t.rich('training', { duration: f.duration(s.minutes), sessions: s.sessions, v: ink('exercise') }))
  // A month still to come has nothing to count yet.
  if (!s.of) return <p className="mt-2 h-5 shrink-0" aria-hidden="true" />
  return (
    <p className="mt-2 shrink-0 text-[13px] text-ink-muted">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {part}
        </span>
      ))}
    </p>
  )
}

function DateLabel({ day, inMonth, today, open }: { day: DayKey; inMonth: boolean; today: boolean; open: boolean }) {
  const f = useFormat()
  const date = dayDate(day)
  const first = date.getDate() === 1
  const monthName = first ? <span className="font-semibold">{f.monthFirst ? f.title(f.date(date, 'monthShort')) : f.date(date, 'monthShort')}</span> : null
  return (
    <span className={cn('flex h-6 items-center justify-end gap-1 text-[13px] tabular-nums', inMonth ? 'text-ink' : 'text-ink-faint')}>
      {f.monthFirst && monthName}
      <span
        className={cn(
          'grid h-6 min-w-6 place-items-center rounded-full px-1',
          today ? 'bg-accent font-semibold text-accent-ink' : open ? 'bg-ink font-semibold text-canvas' : first ? 'font-semibold' : '',
        )}
      >
        {date.getDate()}
      </span>
      {!f.monthFirst && monthName}
    </span>
  )
}

function Chips({ agg, workouts = [], dim }: { agg?: DayAgg; workouts?: Workout[]; dim: boolean }) {
  const t = useTranslations('habits.calendar')
  const f = useFormat()
  const tracks = useTracks()
  const chips: { metric: Metric; text: string }[] = []
  if (tracks.weight && agg?.weight != null) chips.push({ metric: 'weight', text: `${f.kg(agg.weight)} kg` })
  if (tracks.food && agg?.foodCount) chips.push({ metric: 'food', text: `${f.int(agg.kcal)} kcal` })
  if (tracks.training) for (const w of workouts) chips.push({ metric: 'training', text: w.name })
  if (!chips.length) return null
  const shown = chips.length > MAX_CHIPS ? chips.slice(0, MAX_CHIPS - 1) : chips
  return (
    <span className={cn('flex min-w-0 flex-col items-start gap-[3px]', dim && 'opacity-50')}>
      {shown.map((chip, i) => {
        const { Icon, tone } = METRIC[chip.metric]
        return (
          <span
            key={i}
            className={cn(
              toneClass(tone),
              'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-(--tone-soft) py-px pr-[7px] pl-[5px] text-xs leading-4 font-medium whitespace-nowrap text-(--tone-ink)',
            )}
          >
            <Icon size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />
            <span className="truncate tabular-nums">{chip.text}</span>
          </span>
        )
      })}
      {chips.length > shown.length ? <span className="px-1 text-[11.5px] leading-4 text-ink-muted">{t('more', { count: chips.length - shown.length })}</span> : null}
    </span>
  )
}

function Bubble({ day, today, selected }: { day: number; today: boolean; selected: boolean }) {
  return (
    <span
      className={cn(
        'grid size-9 place-items-center rounded-full min-[23.4375rem]:size-10',
        today ? 'bg-accent text-accent-ink' : selected ? 'bg-ink text-canvas' : 'text-ink',
      )}
    >
      <span className={cn('text-[16px] tabular-nums', (today || selected) && 'font-semibold')}>{day}</span>
    </span>
  )
}

function Dots({ on }: { on: Record<Metric, boolean> }) {
  return (
    <span className="flex h-1.5 items-center gap-[3px]" aria-hidden="true">
      {(Object.keys(METRIC) as Metric[])
        .filter(metric => on[metric])
        .map(metric => (
          <span key={metric} className={cn(toneClass(METRIC[metric].tone), 'size-1.5 rounded-full bg-(--tone)')} />
        ))}
    </span>
  )
}

function Legend({ className }: { className?: string }) {
  const t = useTranslations('habits.metrics')
  const tracks = useTracks()
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted', className)}>
      {tracks.list.map(metric => {
        const { Icon, tone } = METRIC[metric]
        return (
          <span key={metric} className="inline-flex items-center gap-1.5">
            <Icon size={14} strokeWidth={2.25} className={cn(toneClass(tone), 'text-(--tone)')} aria-hidden="true" />
            {t(metric)}
          </span>
        )
      })}
    </div>
  )
}

function SwipeArea({ onSwipe, children }: { onSwipe: (dir: number) => void; children: ReactNode }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      className="touch-pan-y"
      onTouchStart={event => {
        const touch = event.touches[0]!
        start.current = { x: touch.clientX, y: touch.clientY }
      }}
      onTouchEnd={event => {
        const from = start.current
        start.current = null
        if (!from) return
        const touch = event.changedTouches[0]!
        const dx = touch.clientX - from.x
        const dy = touch.clientY - from.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
      }}
    >
      {children}
    </div>
  )
}

function SelectedDay({ day, agg, today }: { day: DayKey; agg?: DayAgg; today: DayKey }) {
  const t = useTranslations('habits.calendar')
  const tMetric = useTranslations('habits.metrics')
  const f = useFormat()
  const tracks = useTracks()
  const rows: { metric: Metric; value: string | null; detail: string }[] = [
    { metric: 'weight' as const, value: agg?.weight != null ? `${f.kg(agg.weight)} kg` : null, detail: agg?.weight != null ? t('weighIn') : t('notLogged') },
    {
      metric: 'food' as const,
      value: agg?.foodCount ? `${f.int(agg.kcal)} kcal` : null,
      detail: agg?.foodCount ? t('items', { count: agg.foodCount }) : t('notLogged'),
    },
    {
      metric: 'training' as const,
      value: agg?.sessions ? f.duration(agg.minutes) : null,
      detail: agg?.sessions ? t('sessions', { count: agg.sessions }) + (tracks.food && agg.burned ? ` · ${f.int(agg.burned)} kcal` : '') : t('notLogged'),
    },
  ].filter(row => tracks[row.metric])
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-card shadow-xs" aria-label={t('selectedDay')}>
      <div className="flex min-h-13 items-center gap-2.5 border-b border-line py-2 pr-3 pl-4">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{f.title(f.date(day, 'longDate'))}</span>
          <span className={cn('block text-[12.5px]', day === today ? 'font-medium text-accent' : 'text-ink-muted')}>{f.relative(day, today)}</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => openDay(day)}>
          {t('open')}
        </Button>
      </div>
      <ul>
        {rows.map((row, i) => {
          const { Icon, tone } = METRIC[row.metric]
          return (
            <li key={row.metric} className={cn(i > 0 && 'border-t border-line')}>
              <button type="button" onClick={() => openDay(day, row.metric)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
                <Icon size={17} strokeWidth={2} className={cn(toneClass(tone), 'shrink-0 text-(--tone)')} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{tMetric(row.metric)}</span>
                  <span className="block truncate text-xs text-ink-muted">{row.detail}</span>
                </span>
                {row.value ? <Num className="shrink-0 text-sm text-ink">{row.value}</Num> : <span className="shrink-0 text-[13px] font-medium text-accent">{t('add')}</span>}
                <ChevronRight size={15} className="shrink-0 text-ink-faint" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MonthSummary({ summary: s, month, isCurrent, className }: { summary: Summary; month: Date; isCurrent: boolean; className?: string }) {
  const t = useTranslations('habits.calendar.summary')
  const f = useFormat()
  const tracks = useTracks()
  const name = f.date(month, 'monthLong')
  const cells = [
    { key: 'logged', on: true, value: t('loggedValue', { logged: s.logged, total: s.of }), sub: '', tone: null },
    {
      key: 'lastWeighIn',
      on: tracks.weight,
      value: s.lastWeight != null ? `${f.kg(s.lastWeight)} kg` : '—',
      sub: s.wLast ? f.date(s.wLast, 'monthDay') : '',
      tone: 'weight',
    },
    { key: 'food', on: tracks.food, value: s.kcal ? `${f.int(s.kcal)} kcal` : '—', sub: s.foodDays ? t('daysLogged', { count: s.foodDays }) : '', tone: 'food' },
    {
      key: 'training',
      on: tracks.training,
      value: s.minutes ? f.duration(s.minutes) : '—',
      sub: s.sessions ? t('sessions', { count: s.sessions }) : '',
      tone: 'exercise',
    },
  ].filter(cell => cell.on) as { key: 'logged' | 'lastWeighIn' | 'food' | 'training'; value: string; sub: string; tone: Tone | null }[]
  return (
    <section className={cn('overflow-hidden rounded-xl border border-line bg-card shadow-xs', className)} aria-label={t('label', { month: name })}>
      <div className="flex min-h-13 items-center border-b border-line px-4">
        <h2 className="text-sm font-semibold text-ink">{isCurrent ? t('soFar', { month: name }) : f.title(name)}</h2>
      </div>
      <dl className="grid grid-cols-2">
        {cells.map((cell, i) => (
          <div key={cell.key} className={cn('px-4 py-3', i % 2 === 0 && 'border-r border-line', i > 1 && 'border-t border-line', cell.tone && toneClass(cell.tone))}>
            <dt className="text-xs text-ink-muted">{t(cell.key)}</dt>
            <dd className={cn('m-0 mt-0.5 text-[16px] tabular-nums', cell.key !== 'logged' && 'font-mono', cell.tone ? 'text-(--tone-ink)' : 'text-ink')}>{cell.value}</dd>
            {cell.sub ? <dd className="m-0 text-xs text-ink-muted">{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  )
}

export function CalendarSkeleton() {
  const t = useTranslations('habits.calendar')
  return (
    <div className="p-4 md:p-6" aria-busy="true" aria-label={t('loadingCalendar')}>
      <Skeleton className="h-9 w-60" />
      <Skeleton className="mt-6 h-[26.25rem] rounded-2xl md:h-[40rem]" />
    </div>
  )
}

