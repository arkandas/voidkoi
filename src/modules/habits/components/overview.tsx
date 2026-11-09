'use client'

import { CalendarCheck, Check, Footprints, RefreshCw, Scale, Target, UtensilsCrossed } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addDays } from '@/lib/days'
import type { DayMap, RangeData } from '@/modules/habits/lib/aggregate'
import { bumpData, useGoal, useRange } from '@/modules/habits/lib/data'
import { historyRange, weekKeys, type DayKey } from '@/modules/habits/lib/dates'
import { dayStreak, planStatus, weighInOnOrBefore, type PlanStatus } from '@/modules/habits/lib/insights'
import { openLog } from '@/modules/habits/lib/log'
import { openDay } from '@/modules/habits/lib/nav'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useToday } from '@/modules/habits/lib/use-today'
import { useTracks, type Tracks } from '@/modules/habits/lib/use-tracks'

import { Card, Num, Pill, Skeleton, TabStrip, toneClass, value, type Tone } from './bits'
import { GoalDialog } from './goal-dialog'

type Range = '30' | '90' | '180' | '365'
type Point = { key: DayKey; weight: number }

const RANGES = [
  { value: '30', key: 'days30' },
  { value: '90', key: 'days90' },
  { value: '180', key: 'days180' },
  { value: '365', key: 'year' },
] as const
const GRID_WEEKS = 53
const PHONE_WEEKS = 17
const REFERENCE_WEEK = weekKeys('2024-01-01')
const gridStart = (today: DayKey) => addDays(weekKeys(today)[0]!, -7 * (GRID_WEEKS - 1))

/** The weight and the plan, this week's training and food, and a year of weigh-ins and workouts: what the account tracks. */
export function Overview() {
  const t = useTranslations('habits.overview')
  const today = useToday()
  const tracks = useTracks()
  const range = today ? historyRange(today) : null
  const start = range?.start ?? null
  const { data, failed } = useRange(start, range?.end ?? null)
  const { goal, ready: goalReady, failed: goalFailed } = useGoal()
  const [goalOpen, setGoalOpen] = useState(false)

  const model = useMemo(() => {
    if (!data || !today || !start) return null
    const weights = data.weights.filter(w => w.key <= today)
    return {
      weights,
      plan: planStatus(goal, weights, today),
      week: weekKeys(today),
      streak: dayStreak(data.days, today, start, gridStart(today), tracks),
      last: weighInOnOrBefore(weights, today),
    }
  }, [data, today, start, goal, tracks])

  if (!today || !data || !model || !goalReady) return <Page>{failed || goalFailed ? <LoadError /> : <OverviewSkeleton />}</Page>
  const target = goal?.targetWeight ?? null
  const editGoal = () => setGoalOpen(true)
  const both = tracks.training && tracks.food

  return (
    <Page>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">{t('title')}</h1>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {tracks.weight ? (
          <>
            <WeightCard className="lg:col-span-8" today={today} weights={model.weights} last={model.last} target={target} plan={model.plan} onEditGoal={editGoal} />
            <PlanCard className="lg:col-span-4" target={target} plan={model.plan} hasStart={!!goal?.startDate} hasWeighIns={!!model.last} onEditGoal={editGoal} />
          </>
        ) : null}
        {tracks.training ? (
          <TrainingCard
            className={both ? 'lg:col-span-8' : 'lg:col-span-12'}
            today={today}
            week={model.week}
            data={data}
            target={goal?.weeklyWorkouts ?? null}
            onEditTarget={editGoal}
          />
        ) : null}
        {tracks.food ? <FoodCard className={both ? 'lg:col-span-4' : 'lg:col-span-12'} today={today} week={model.week} days={data.days} /> : null}
        {tracks.weight || tracks.training ? <ConsistencyCard className="lg:col-span-12" today={today} days={data.days} streak={model.streak} tracks={tracks} /> : null}
      </div>

      <GoalDialog open={goalOpen} onClose={() => setGoalOpen(false)} goal={goal} weights={model.weights} today={today} />
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[100rem] px-4 pt-5 pb-12 md:px-6 md:pt-6 xl:px-8">{children}</div>
}

function WeightCard({
  className,
  today,
  weights,
  last,
  target,
  plan,
  onEditGoal,
}: {
  className: string
  today: DayKey
  weights: Point[]
  last: Point | null
  target: number | null
  plan: PlanStatus | null
  onEditGoal: () => void
}) {
  const t = useTranslations('habits.overview.weight')
  const tRanges = useTranslations('habits.overview.ranges')
  const f = useFormat()
  const [range, setRange] = useState<Range>('90')
  const from = addDays(today, -(Number(range) - 1))
  const points = weights.filter(w => w.key >= from && w.key <= today)
  const remaining = plan ? plan.remaining : last && target != null ? Math.abs(last.weight - target) : null
  return (
    <Card
      label={t('title')}
      icon={Scale}
      tone="weight"
      className={className}
      head={
        <>
          <TabStrip<Range>
            group
            label={tRanges('label')}
            value={range}
            onChange={setRange}
            className="order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:min-w-[19rem]"
            items={RANGES.map(r => ({ value: r.value, label: tRanges(r.key) }))}
          />
          <Button variant="outline" size="sm" onClick={() => openLog('weight')} className="ml-auto sm:ml-0">
            {t('log')}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3 px-5 pt-4">
        <div>
          <div className="text-xs font-medium text-ink-muted">{last ? t('weighIn', { when: f.relative(last.key, today) }) : t('noWeighIns')}</div>
          <div className="flex items-baseline gap-1.5">
            <Num className="text-[38px] leading-[1.1] font-medium tracking-[-0.03em] text-ink">{last ? f.kg(last.weight) : '—'}</Num>
            <span className="text-[15px] text-ink-muted">kg</span>
          </div>
        </div>
        <div className="pb-1">
          <div className="text-xs font-medium text-ink-muted">{t('goal')}</div>
          {target != null ? (
            <button type="button" onClick={onEditGoal} className={cn(toneClass('streak'), 'text-left hover:underline')}>
              <Num className="text-[20px] text-(--tone-ink)">{f.kg(target)}</Num>{' '}
              <span className="text-[13px] text-ink-muted">
                kg{plan?.reached ? ` · ${t('reached')}` : remaining != null ? ` · ${t('toGo', { kg: f.kg(remaining) })}` : ''}
              </span>
            </button>
          ) : (
            <Button variant="outline" size="sm" onClick={onEditGoal} className="mt-1">
              {t('setGoal')}
            </Button>
          )}
        </div>
      </div>
      <div className="pt-4 pr-3 pb-4 pl-2">
        <WeightChart points={points} />
      </div>
    </Card>
  )
}

function WeightChart({ points }: { points: Point[] }) {
  const t = useTranslations('habits.overview.weight')
  const f = useFormat()
  const gradient = `w${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  if (!points.length) {
    return <div className="grid h-[260px] place-items-center text-sm text-ink-muted">{t('emptyRange')}</div>
  }
  const data = points.map(w => ({ key: w.key, label: f.date(w.key, 'monthDay'), weight: Math.round(w.weight * 10) / 10 }))
  const lo = Math.min(...data.map(d => d.weight)) - 1
  const hi = Math.max(...data.map(d => d.weight)) + 1
  const step = hi - lo <= 6 ? 1 : hi - lo <= 12 ? 2 : 5
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step)
  const chartLabel = t('chartLabel', {
    from: f.date(points[0]!.key, 'shortDate'),
    to: f.date(points.at(-1)!.key, 'shortDate'),
    count: points.length,
  })
  return (
    <div className={cn(toneClass('weight'), 'h-[260px] w-full')} role="img" aria-label={chartLabel}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 260 }}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--weight)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--weight)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--ink-muted)', fontSize: 11, dy: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            domain={[min, max]}
            ticks={ticks}
            interval={0}
            tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={62}
            unit=" kg"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--raised)',
              border: '1px solid var(--line-strong)',
              borderRadius: 8,
              fontSize: 12,
              boxShadow: 'var(--shadow-pop)',
            }}
            labelStyle={{ color: 'var(--ink-muted)', marginBottom: 4 }}
            itemStyle={{ color: 'var(--ink)', fontWeight: 600 }}
            cursor={{ stroke: 'var(--line-strong)' }}
            formatter={v => [`${f.kg(Number(v))} kg`, t('title')]}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="var(--weight)"
            strokeWidth={2.5}
            fill={`url(#${gradient})`}
            dot={{ fill: 'var(--weight)', r: 3, strokeWidth: 0 }}
            activeDot={{ fill: 'var(--weight)', r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-line px-5 py-2 last:border-b-0">
      <dt className="min-w-0 flex-1 text-ink-muted">{label}</dt>
      <dd className="m-0 text-right text-ink">{children}</dd>
    </div>
  )
}

function PlanCard({
  className,
  target,
  plan,
  hasStart,
  hasWeighIns,
  onEditGoal,
}: {
  className: string
  target: number | null
  plan: PlanStatus | null
  hasStart: boolean
  hasWeighIns: boolean
  onEditGoal: () => void
}) {
  const t = useTranslations('habits.overview.plan')
  const f = useFormat()
  const edit = (label: string) => (
    <Button variant="outline" size="sm" onClick={onEditGoal} className="ml-auto">
      {label}
    </Button>
  )
  if (target == null) {
    return (
      <Card label={t('title')} icon={Target} tone="streak" className={className} head={edit(t('setGoal'))}>
        <div className="flex flex-1 flex-col items-start justify-center gap-1 px-5 py-6">
          <p className="font-medium text-ink">{t('noGoal')}</p>
        </div>
      </Card>
    )
  }
  if (!plan) {
    return (
      <Card label={t('title')} icon={Target} tone="streak" className={className} head={edit(t('edit'))}>
        <dl className="m-0 text-sm">
          <Row label={t('goal')}>
            <Num>{f.kg(target)} kg</Num>
          </Row>
        </dl>
        <p className="px-5 py-4 text-[13px] text-ink-muted">{!hasWeighIns ? t('needWeighIn') : !hasStart ? t('needStart') : null}</p>
      </Card>
    )
  }
  const behind = plan.vsPlan != null && plan.vsPlan < -0.05
  const ahead = plan.vsPlan != null && plan.vsPlan > 0.05
  const pct = Math.round(plan.progress * 100)
  const since = f.date(plan.startKey, 'monthDay')
  return (
    <Card
      label={t('title')}
      icon={Target}
      tone="streak"
      className={className}
      head={edit(t('edit'))}
      foot={
        <div className="w-full">
          <div className="flex text-[13px] text-ink-muted">
            <span className="flex-1">{t('progress')}</span>
            <span>
              {t.rich('progressValue', {
                done: f.kg(Math.max(0, plan.actual * plan.dir)),
                total: f.kg(Math.abs(plan.target - plan.startWeight)),
                pct,
                v: value,
              })}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted dark:bg-line" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      }
    >
      <dl className="m-0 flex-1 text-sm">
        <Row label={t('goal')}>
          <Num>{f.kg(plan.target)} kg</Num>
        </Row>
        <Row label={t('start', { date: since })}>
          <Num>{f.kg(plan.startWeight)} kg</Num>
        </Row>
        <Row label={t('weeklyTarget')}>
          {plan.rate ? (
            <Num>{t('perWeek', { rate: f.rate(plan.dir * plan.rate) })}</Num>
          ) : (
            <button type="button" onClick={onEditGoal} className="font-medium text-accent hover:underline">
              {t('setOne')}
            </button>
          )}
        </Row>
        {plan.planned != null ? (
          <Row label={t('plannedSince', { date: since })}>
            <Num>{f.delta(plan.planned)} kg</Num>
          </Row>
        ) : null}
        <Row label={t('actualSince', { date: since })}>
          <Num>{f.delta(plan.actual)} kg</Num>
        </Row>
        {plan.planned != null ? (
          <Row label={t('versusPlan')}>
            <Pill tone={behind ? 'streak' : ahead ? 'exercise' : undefined}>
              {behind ? t('behind', { kg: f.kg(-plan.vsPlan!) }) : ahead ? t('ahead', { kg: f.kg(plan.vsPlan!) }) : t('onPlan')}
            </Pill>
          </Row>
        ) : null}
        {plan.planEnd && !plan.reached ? <Row label={t('reachesGoal')}>{f.date(plan.planEnd, 'monthDayYear')}</Row> : null}
      </dl>
    </Card>
  )
}

function TrainingCard({
  className,
  today,
  week,
  data,
  target,
  onEditTarget,
}: {
  className: string
  today: DayKey
  week: DayKey[]
  data: RangeData
  target: number | null
  onEditTarget: () => void
}) {
  const t = useTranslations('habits.overview.training')
  const f = useFormat()
  const byDay = new Map<DayKey, RangeData['workouts']>()
  for (const workout of data.workouts) {
    if (week.includes(workout.date)) byDay.set(workout.date, [...(byDay.get(workout.date) ?? []), workout])
  }
  const thisWeek = week.filter(day => day <= today).reduce((sum, day) => sum + (byDay.get(day)?.length ?? 0), 0)
  const met = !!target && thisWeek >= target
  return (
    <Card
      label={t('title')}
      icon={Footprints}
      tone="exercise"
      className={className}
      title={
        <>
          {t('title')} <span className="font-normal text-ink-muted">· {t('week', { from: f.date(week[0]!, 'monthDay'), to: f.date(week[6]!, 'monthDay') })}</span>
        </>
      }
      head={
        <>
          <button type="button" onClick={onEditTarget} title={t('target')} className="rounded-full focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25">
            <Pill tone={met ? 'exercise' : undefined} className="hover:brightness-95 dark:hover:brightness-125">
              {target ? t('ofTarget', { done: thisWeek, target }) : t('count', { count: thisWeek })}
            </Pill>
          </button>
          <Button variant="outline" size="sm" onClick={() => openLog('training')} className="ml-auto">
            {t('log')}
          </Button>
        </>
      }
    >
      <div className="grid flex-1 grid-cols-7 gap-1.5 p-3 sm:gap-2.5 sm:p-5">
        {week.map(day => {
          const list = byDay.get(day) ?? []
          const isToday = day === today
          const future = day > today
          const done = list.length > 0
          return (
            <button
              key={day}
              type="button"
              onClick={() => openDay(day, 'training')}
              title={done ? list.map(w => `${w.name} · ${f.duration(w.minutes)}`).join('\n') : undefined}
              aria-label={`${f.date(day, 'longDate')}: ${done ? list.map(w => `${w.name}, ${f.duration(w.minutes)}`).join('; ') : t('noWorkout')}`}
              className={cn(
                toneClass('exercise'),
                'flex min-h-24 min-w-0 flex-col items-center gap-1 rounded-[10px] border px-1 py-2 text-center transition-[filter,background-color] sm:items-start sm:p-2.5 sm:text-left',
                done
                  ? 'border-transparent bg-(--tone) text-(--tone-on) hover:brightness-110'
                  : future
                    ? 'border-line text-ink-faint'
                    : 'border-line bg-surface hover:bg-muted',
                isToday && 'ring-2 ring-accent ring-offset-2 ring-offset-card',
              )}
            >
              <span className={cn('text-xs', done ? 'font-medium opacity-85' : future ? '' : 'text-ink-muted')}>
                <span className="sm:hidden">{f.title(f.date(day, 'weekdayNarrow'))}</span>
                <span className="max-sm:hidden">{f.title(f.date(day, 'weekdayShort'))}</span>
              </span>
              <Num className={cn('text-[16px] leading-none sm:text-[18px]', done ? 'font-semibold' : isToday ? 'font-semibold text-accent' : '')}>
                {Number(day.slice(8))}
              </Num>
              {done ? (
                <span className="mt-auto flex flex-wrap gap-0.5" aria-hidden="true">
                  {list.map(w => (
                    <Check key={w.id} strokeWidth={3} className="size-4 sm:size-[18px]" />
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function FoodCard({ className, today, week, days }: { className: string; today: DayKey; week: DayKey[]; days: DayMap }) {
  const t = useTranslations('habits.overview.food')
  const f = useFormat()
  const logged = week.filter(day => day <= today && days[day]?.foodCount)
  const weekTotal = logged.reduce((sum, day) => sum + days[day]!.kcal, 0)
  const max = Math.max(1, ...week.map(day => days[day]?.kcal ?? 0))
  const kcal = days[today]?.foodCount ? days[today]!.kcal : 0
  return (
    <Card
      label={t('title')}
      icon={UtensilsCrossed}
      tone="food"
      className={className}
      head={
        <Button variant="outline" size="sm" onClick={() => openLog('food')} className="ml-auto">
          {t('log')}
        </Button>
      }
    >
      {logged.length ? (
        <div className="flex flex-1 flex-col p-5">
          <div className="text-xs font-medium text-ink-muted">{t('today')}</div>
          <div className="flex items-baseline gap-1.5">
            <Num className="text-[28px] leading-tight font-medium text-ink">{f.int(kcal)}</Num>
            <span className="text-[13px] text-ink-muted">kcal</span>
          </div>
          <p className="text-[13px] text-ink-muted">{t.rich('thisWeek', { kcal: f.int(weekTotal), days: logged.length, v: value })}</p>
          <div className="mt-auto flex h-24 items-end gap-1.5 pt-4" aria-hidden="true">
            {week.map(day => {
              const kcalThen = day <= today && days[day]?.foodCount ? days[day]!.kcal : 0
              return (
                <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    title={kcalThen ? `${f.date(day, 'shortDate')} · ${f.int(kcalThen)} kcal` : undefined}
                    className={cn('w-full rounded-t-[3px]', kcalThen ? (day === today ? 'bg-(--food)' : 'bg-(--food)/50') : 'bg-muted dark:bg-line')}
                    style={{ height: kcalThen ? `${Math.max(6, (kcalThen / max) * 100)}%` : 3 }}
                  />
                  <span className={cn('text-[11px]', day === today ? 'font-semibold text-(--food-ink)' : 'text-ink-muted')}>{f.title(f.date(day, 'weekdayNarrow'))}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="grid size-10 place-items-center rounded-[10px] border border-line-strong bg-surface text-(--food-ink)">
            <UtensilsCrossed size={18} aria-hidden="true" />
          </span>
          <span className="font-medium text-ink">{t('empty')}</span>
        </div>
      )}
    </Card>
  )
}

function ConsistencyCard({
  className,
  today,
  days,
  streak,
  tracks,
}: {
  className: string
  today: DayKey
  days: DayMap
  streak: { current: number; best: number }
  tracks: Tracks
}) {
  const t = useTranslations('habits.overview.consistency')
  const f = useFormat()
  const both = tracks.weight && tracks.training
  const tone: Tone = tracks.weight ? 'weight' : 'exercise'
  const first = gridStart(today)
  const cols = Array.from({ length: GRID_WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
  const month = Array.from({ length: 30 }, (_, i) => addDays(today, -i))
  const weighed = month.filter(day => days[day]?.weight != null).length
  const trained = month.filter(day => days[day]?.sessions).length
  const monthOf = (col: DayKey[]) => col.find(day => day.endsWith('-01') && day <= today)
  const shown = (w: number) => (w < GRID_WEEKS - PHONE_WEEKS ? 'hidden sm:block' : '')
  const dayLabels = REFERENCE_WEEK.map((day, d) => (d % 2 === 0 ? f.title(f.date(day, 'weekdayShort')) : ''))
  const levelOf = (day: DayKey) => {
    if (day > today) return -1
    const weighIn = tracks.weight && days[day]?.weight != null
    const workout = tracks.training && !!days[day]?.sessions
    return both ? Number(weighIn) + Number(workout) : weighIn || workout ? 2 : 0
  }
  const describe = (day: DayKey) => {
    const weighIn = tracks.weight && days[day]?.weight != null
    const workout = tracks.training && !!days[day]?.sessions
    return t(weighIn && workout ? 'both' : weighIn ? 'weighIn' : workout ? 'workout' : 'nothing')
  }
  const shades = ['bg-muted dark:bg-line', 'bg-(--tone)/45', 'bg-(--tone)']
  return (
    <Card
      label={t('title')}
      icon={CalendarCheck}
      tone={tone}
      className={className}
      head={
        <>
          {streak.current > 0 ? <Pill tone="streak">{t('streak', { count: streak.current })}</Pill> : null}
          <span className="ml-auto text-[13px] text-ink-muted">{t('best', { count: streak.best })}</span>
        </>
      }
    >
      <div className="flex flex-col p-5">
        <p className="text-[13px] text-ink-muted">
          {tracks.weight ? t.rich('weighedIn', { count: weighed, v: value }) : t.rich('trained', { count: trained, v: value })}
        </p>
        <div
          role="img"
          aria-label={t(both ? 'gridLabel' : tracks.weight ? 'gridLabelWeight' : 'gridLabelTraining')}
          className="mt-4 grid grid-cols-[2rem_repeat(17,minmax(0,1fr))] gap-[3px] sm:grid-cols-[2rem_repeat(53,minmax(0,1fr))]"
        >
          <span />
          {cols.map((col, w) => {
            const m = monthOf(col)
            return (
              <span key={`m${w}`} className={cn(shown(w), 'h-4 overflow-visible text-[11px] leading-4 whitespace-nowrap text-ink-muted')} aria-hidden="true">
                {m ? f.title(f.date(m, 'monthShort')) : ''}
              </span>
            )
          })}
          {dayLabels.flatMap((label, d) => [
            <span key={`d${d}`} className="flex items-center text-[11px] text-ink-muted" aria-hidden="true">
              {label}
            </span>,
            ...cols.map((col, w) => {
              const day = col[d]!
              const level = levelOf(day)
              return (
                <span
                  key={day}
                  title={day <= today ? `${f.date(day, 'shortDate')}: ${describe(day)}` : undefined}
                  className={cn(shown(w), 'aspect-square rounded-[3px]', level < 0 ? 'bg-transparent' : shades[level], day === today && 'ring-1 ring-ink-muted')}
                />
              )
            }),
          ])}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 pl-10 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-muted dark:bg-line" />
            {t('legendNothing')}
          </span>
          {both ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-(--tone)/45" />
                {t('legendOne')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-(--tone)" />
                {t('legendBoth')}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-(--tone)" />
              {tracks.weight ? t('legendWeighIn') : t('legendWorkout')}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

function LoadError() {
  const t = useTranslations('habits.overview')
  const tCommon = useTranslations('habits.common')
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-6">
      <p className="text-base font-medium text-ink">{t('loadError')}</p>
      <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={bumpData}>
        {tCommon('tryAgain')}
      </Button>
    </div>
  )
}

function OverviewSkeleton() {
  const t = useTranslations('common')
  return (
    <div aria-busy="true" aria-label={t('loading')}>
      <Skeleton className="h-8 w-40" />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Skeleton className="h-[26rem] rounded-xl lg:col-span-8" />
        <Skeleton className="h-[26rem] rounded-xl lg:col-span-4" />
        <Skeleton className="h-64 rounded-xl lg:col-span-8" />
        <Skeleton className="h-64 rounded-xl lg:col-span-4" />
      </div>
    </div>
  )
}
