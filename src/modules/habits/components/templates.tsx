'use client'

import { Activity, Dumbbell, Footprints, PersonStanding, Plus, RefreshCw, Search, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { Button, Input, Modal, Select, Textarea, fieldClasses, labelClasses, useToast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dayKey, daysBetween } from '@/lib/days'
import { useApiError } from '@/lib/use-api-error'
import { api } from '@/modules/habits/lib/api'
import type { MealTemplate, WorkoutTemplate } from '@/modules/habits/lib/api-types'
import { bumpData, useRange, useTemplates } from '@/modules/habits/lib/data'
import { historyRange, type DayKey } from '@/modules/habits/lib/dates'
import { parseDecimal, parseIntStrict, type Format } from '@/modules/habits/lib/format'
import { entryKcal, EXERCISE_TYPES, MEAL_TYPES } from '@/modules/habits/lib/metrics'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useLabels } from '@/modules/habits/lib/use-labels'
import { useToday } from '@/modules/habits/lib/use-today'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { CardHead, FormError, Num, Skeleton, toneClass } from './bits'
import { useMediaQuery } from '@/lib/use-media-query'

type Kind = 'exercise' | 'food'
type Template = WorkoutTemplate | MealTemplate
type Selection = { kind: Kind; id: number | 'new' } | null
type Use = { count: number; last: DayKey; weeks: number[] }
type Usage = Map<string, Use>

const USAGE_DAYS = 90
const WEEKS = 13
const lastUsed = (f: Format, day: DayKey) => f.date(day, day.startsWith(String(new Date().getFullYear())) ? 'monthDay' : 'monthDayYear')
const TYPE_ICON: Record<string, LucideIcon> = { cardio: Footprints, strength: Dumbbell, flexibility: PersonStanding, sports: Trophy }
const iconFor = (kind: Kind, template?: Template | null): LucideIcon =>
  kind === 'food' ? UtensilsCrossed : (TYPE_ICON[(template as WorkoutTemplate | undefined)?.type ?? ''] ?? Activity)
const toneOf = (kind: Kind) => toneClass(kind === 'food' ? 'food' : 'exercise')

/** Most used first, then by name. */
function byUse<T extends Template>(list: T[] | null, usage: Usage) {
  return (
    list &&
    [...list].sort(
      (a, b) => (usage.get(b.name.toLowerCase())?.count ?? 0) - (usage.get(a.name.toLowerCase())?.count ?? 0) || a.name.localeCompare(b.name),
    )
  )
}

/** Saved workouts and meals: how often each is logged, an editor beside the list, and Log for today. */
export function Templates() {
  const t = useTranslations('habits.templates')
  const tCommon = useTranslations('habits.common')
  const today = useToday()
  const tracks = useTracks()
  const range = today ? historyRange(today) : null
  const { data, failed: usageFailed } = useRange(range?.start ?? null, range?.end ?? null)
  const { templates, failed } = useTemplates(tracks.food, tracks.training)
  const [selected, setSelected] = useState<Selection>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const wide = useMediaQuery('(min-width: 64rem)')
  const logTemplate = useLogTemplate(today)

  const usage = useMemo(() => {
    const out: Record<Kind, Usage> = { exercise: new Map(), food: new Map() }
    if (!data || !today) return out
    const add = (map: Usage, name: string, day: DayKey) => {
      const ago = daysBetween(day, today)
      if (ago < 0) return
      const key = name.toLowerCase()
      const use = map.get(key) ?? { count: 0, last: day, weeks: Array<number>(WEEKS).fill(0) }
      if (day > use.last) use.last = day
      if (ago < USAGE_DAYS) use.count++
      if (ago < WEEKS * 7) use.weeks[WEEKS - 1 - Math.floor(ago / 7)]!++
      map.set(key, use)
    }
    for (const workout of data.workouts) add(out.exercise, workout.name, workout.date)
    for (const food of data.foods) add(out.food, food.name, food.date)
    return out
  }, [data, today])

  const usageKnown = !!data
  const ready = !!templates && (!!data || usageFailed)
  const exRows = useMemo(() => (ready ? byUse(templates!.workouts, usage.exercise) : null), [ready, templates, usage])
  const mealRows = useMemo(() => (ready ? byUse(templates!.meals, usage.food) : null), [ready, templates, usage])
  const rows: Record<Kind, Template[] | null> = { exercise: exRows, food: mealRows }
  const kinds: Kind[] = [...(tracks.training ? (['exercise'] as const) : []), ...(tracks.food ? (['food'] as const) : [])]

  const exists = (s: Selection) => !!s && s.id !== 'new' && !!rows[s.kind]?.some(row => row.id === s.id)
  const firstOf = (kind: Kind) => rows[kind]?.[0]
  const current: Selection =
    selected?.id === 'new' && kinds.includes(selected.kind)
      ? selected
      : exists(selected)
        ? selected
        : !wide || !ready
          ? null
          : (kinds.map(kind => (firstOf(kind) ? ({ kind, id: firstOf(kind)!.id } as Selection) : null)).find(Boolean) ?? { kind: kinds[0]!, id: 'new' })
  const item = current && current.id !== 'new' ? (rows[current.kind]?.find(row => row.id === current.id) ?? null) : null

  const open = (s: Selection) => {
    setSelected(s)
    if (!wide) setDialogOpen(true)
  }
  const editorProps: EditorProps = {
    focus: selected?.id === 'new',
    usage: current && item ? usage[current.kind].get(item.name.toLowerCase()) : undefined,
    usageKnown,
    onLog: logTemplate.log,
    logging: !!(current && item && logTemplate.logging(current.kind, item.id)),
    onSaved: (kind, id) => {
      setSelected({ kind, id })
      if (!wide) setDialogOpen(false)
    },
    onDeleted: () => {
      setSelected(null)
      setDialogOpen(false)
    },
    onCancel: () => {
      setSelected(null)
      setDialogOpen(false)
    },
    framed: wide,
  }
  const editor =
    current &&
    (current.kind === 'food' ? (
      <MealEditor key={`m${current.id}`} item={item as MealTemplate | null} {...editorProps} />
    ) : (
      <WorkoutEditor key={`e${current.id}`} item={item as WorkoutTemplate | null} {...editorProps} />
    ))
  const editorTitle = current ? (current.kind === 'food' ? (item ? t('food.edit') : t('food.new')) : item ? t('exercise.edit') : t('exercise.new')) : t('editor')

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 pt-5 pb-12 md:px-6 md:pt-6 xl:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[22px] font-semibold tracking-[-0.01em] text-ink">{t('title')}</h1>
        <div className={cn('grid w-full gap-2 sm:flex sm:w-auto', kinds.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {tracks.food ? (
            <Button variant="outline" size="sm" icon={<Plus size={15} />} onClick={() => open({ kind: 'food', id: 'new' })}>
              {t('food.new')}
            </Button>
          ) : null}
          {tracks.training ? (
            <Button variant="outline" size="sm" icon={<Plus size={15} />} onClick={() => open({ kind: 'exercise', id: 'new' })}>
              {t('exercise.new')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
          {failed && !templates ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-6">
              <p className="font-medium text-ink">{t('loadError')}</p>
              <Button variant="outline" size="sm" icon={<RefreshCw size={14} />} onClick={bumpData}>
                {tCommon('tryAgain')}
              </Button>
            </div>
          ) : (
            kinds.map(kind => (
              <KindCard
                key={kind}
                kind={kind}
                rows={rows[kind]}
                usage={usage[kind]}
                current={current}
                onPick={id => open({ kind, id })}
                onNew={() => open({ kind, id: 'new' })}
                onLog={template => void logTemplate.log(kind, template)}
                logging={id => logTemplate.logging(kind, id)}
                usageKnown={usageKnown}
              />
            ))
          )}
        </div>

        {wide ? (
          <aside aria-label={t('editor')} className="sticky top-5 overflow-hidden rounded-xl border border-line bg-card shadow-xs lg:col-span-4">
            {editor || (
              <div className="space-y-3 p-5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-24" />
              </div>
            )}
          </aside>
        ) : (
          <Modal open={dialogOpen && !!current} onClose={() => setDialogOpen(false)} label={editorTitle} title={editorTitle} padded={false}>
            {dialogOpen ? editor : null}
          </Modal>
        )}
      </div>
    </div>
  )
}

/** Logs a template for today, once at a time per template, with Undo. */
function useLogTemplate(today: DayKey | null) {
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const apiError = useApiError()
  const toast = useToast()
  const inFlight = useRef(new Set<string>())
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const log = async (kind: Kind, template: Template) => {
    const key = `${kind}:${template.id}`
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setPending(new Set(inFlight.current))
    const date = today ?? dayKey(new Date())
    try {
      const created =
        kind === 'food'
          ? await api.addFood({
              date,
              name: template.name,
              calories: template.calories,
              quantity: (template as MealTemplate).quantity,
              mealType: (template as MealTemplate).mealType,
            })
          : await api.addWorkout({
              date,
              name: template.name,
              minutes: (template as WorkoutTemplate).minutes,
              caloriesBurned: template.calories,
              type: (template as WorkoutTemplate).type,
              notes: (template as WorkoutTemplate).notes,
            })
      toast.show(tToasts('loggedToday', { name: template.name }), 'info', {
        label: tCommon('undo'),
        run: () => {
          ;(kind === 'food' ? api.deleteFood(created.id) : api.deleteWorkout(created.id))
            .then(bumpData)
            .catch(error => toast.show(apiError(error, 'deleteFailed'), 'error'))
        },
      })
      bumpData()
    } catch (error) {
      toast.show(apiError(error, 'saveFailed'), 'error')
    } finally {
      inFlight.current.delete(key)
      setPending(new Set(inFlight.current))
    }
  }
  return { log, logging: (kind: Kind, id: number) => pending.has(`${kind}:${id}`) }
}

function useKindCopy(kind: Kind) {
  const t = useTranslations('habits.templates')
  return kind === 'food'
    ? {
        title: t('food.title'),
        filter: t('food.filter'),
        empty: t('food.empty'),
        add: t('food.new'),
        cols: [t('food.meal'), t('food.servings'), 'kcal'],
      }
    : {
        title: t('exercise.title'),
        filter: t('exercise.filter'),
        empty: t('exercise.empty'),
        add: t('exercise.new'),
        cols: [t('exercise.type'), t('exercise.duration'), t('exercise.calories')],
      }
}

function KindCard({
  kind,
  rows,
  usage,
  usageKnown,
  current,
  onPick,
  onNew,
  onLog,
  logging,
}: {
  kind: Kind
  rows: Template[] | null
  usage: Usage
  usageKnown: boolean
  current: Selection
  onPick: (id: number) => void
  onNew: () => void
  onLog: (template: Template) => void
  logging: (id: number) => boolean
}) {
  const t = useTranslations('habits.templates')
  const copy = useKindCopy(kind)
  const f = useFormat()
  const labels = useLabels()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = rows?.filter(row => !q || row.name.toLowerCase().includes(q)) ?? null
  const cells = (row: Template) => {
    if (kind === 'exercise') {
      const workout = row as WorkoutTemplate
      return { tag: labels.exerciseType(workout.type), a: f.minutes(workout.minutes), b: workout.calories ? `${f.int(workout.calories)} kcal` : '—' }
    }
    const meal = row as MealTemplate
    return { tag: labels.meal(meal.mealType), a: f.num(meal.quantity), b: `${f.int(entryKcal(meal))} kcal` }
  }
  const KindIcon = kind === 'food' ? UtensilsCrossed : Activity

  return (
    <section aria-label={copy.title} className={cn('overflow-hidden rounded-xl border border-line bg-card shadow-xs', toneOf(kind))}>
      <CardHead>
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-(--tone-ink)">
          <KindIcon size={16} strokeWidth={2.25} aria-hidden="true" />
          {copy.title}
        </h2>
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-ink-muted tabular-nums">
          {rows?.length ?? '–'}
        </span>
        {rows && rows.length > 5 ? (
          <label className="relative ml-auto block">
            <span className="sr-only">{copy.filter}</span>
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input
              className={cn(fieldClasses, 'h-8 w-36 pr-2 pl-8 text-[13px] sm:w-52')}
              placeholder={t('filter')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
        ) : null}
      </CardHead>

      {!shown ? (
        <div className="space-y-3 p-5">
          {[0, 1].map(i => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : rows!.length === 0 ? (
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-surface text-(--tone-ink)">
            <KindIcon size={18} aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 font-medium text-ink">{copy.empty}</p>
          <Button variant="outline" size="sm" icon={<Plus size={15} />} onClick={onNew}>
            {copy.add}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-ink-muted">{t('nothingMatches')}</p>
      ) : (
        <>
          <table className="hidden w-full table-fixed border-collapse text-sm xl:table">
            <colgroup>
              <col />
              <col className="w-28" />
              <col className="w-22" />
              <col className="w-26" />
              <col className="w-40" />
              <col className="hidden w-26 2xl:table-column" />
              <col className="w-20" />
            </colgroup>
            <thead>
              <tr className="h-[38px] border-b border-line bg-surface text-xs font-medium whitespace-nowrap text-ink-muted [&>th]:px-3 [&>th]:text-left [&>th:first-child]:pl-5 [&>th:last-child]:pr-5">
                <th>{t('name')}</th>
                <th>{copy.cols[0]}</th>
                <th className="text-right!">{copy.cols[1]}</th>
                <th className="text-right!">{copy.cols[2]}</th>
                <th className="pl-6!">{t('used', { days: USAGE_DAYS })}</th>
                <th className="hidden text-right! 2xl:table-cell">{t('lastUsed')}</th>
                <th>
                  <span className="sr-only">{t('actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => {
                const use = usage.get(row.name.toLowerCase())
                const c = cells(row)
                const on = current?.kind === kind && current.id === row.id
                const Icon = iconFor(kind, row)
                return (
                  <tr
                    key={row.id}
                    data-selected={on || undefined}
                    onClick={() => onPick(row.id)}
                    className={cn(
                      'h-15 cursor-pointer border-t border-line whitespace-nowrap transition-colors first:border-t-0 [&>td]:px-3 [&>td:first-child]:pl-5 [&>td:last-child]:pr-5',
                      on ? 'bg-accent-soft' : 'hover:bg-muted',
                    )}
                  >
                    <td>
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon size={17} className="shrink-0 text-(--tone-ink)" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            onPick(row.id)
                          }}
                          aria-pressed={on}
                          className="min-w-0 truncate text-left font-medium text-ink"
                        >
                          {row.name}
                        </button>
                      </span>
                    </td>
                    <td className="truncate text-ink-muted">{c.tag}</td>
                    <td className="text-right text-[13px] text-ink">
                      <Num>{c.a}</Num>
                    </td>
                    <td className="text-right text-[13px] text-ink">
                      <Num>{c.b}</Num>
                    </td>
                    <td className="pl-6!">
                      {use?.count ? (
                        <span className="flex items-center gap-2.5">
                          <Spark weeks={use.weeks} />
                          <Num className="text-[13px] text-ink">{t('uses', { count: use.count })}</Num>
                        </span>
                      ) : (
                        <span className="text-ink-muted">{usageKnown ? t('notUsed') : '—'}</span>
                      )}
                    </td>
                    <td className="hidden text-right text-ink-muted 2xl:table-cell">{use ? lastUsed(f, use.last) : '—'}</td>
                    <td className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={event => {
                          event.stopPropagation()
                          onLog(row)
                        }}
                        disabled={logging(row.id)}
                        aria-label={t('logNamed', { name: row.name })}
                      >
                        {t('log')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <ul className="xl:hidden">
            {shown.map((row, i) => {
              const use = usage.get(row.name.toLowerCase())
              const c = cells(row)
              const Icon = iconFor(kind, row)
              return (
                <li key={row.id} className={cn('flex items-center gap-2 pr-3', i > 0 && 'border-t border-line')}>
                  <button type="button" onClick={() => onPick(row.id)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left">
                    <Icon size={18} className="shrink-0 text-(--tone-ink)" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{row.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">
                        {c.tag} · {kind === 'exercise' ? c.a : c.b}
                        {use?.count ? ` · ${t('usesIn', { count: use.count, days: USAGE_DAYS })}` : ''}
                      </span>
                    </span>
                  </button>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => onLog(row)} disabled={logging(row.id)} aria-label={t('logNamed', { name: row.name })}>
                    {t('log')}
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/** Thirteen weeks of use, a bar each. */
function Spark({ weeks, height = 18, gap = 2, width = 5 }: { weeks: number[]; height?: number; gap?: number; width?: number | 'fill' }) {
  const max = Math.max(1, ...weeks)
  return (
    <span className="flex items-end" style={{ height, gap }} aria-hidden="true">
      {weeks.map((n, i) => (
        <span
          key={i}
          className={cn('rounded-[1.5px]', n ? 'bg-(--tone)' : 'bg-muted dark:bg-line')}
          style={{ width: width === 'fill' ? undefined : width, flex: width === 'fill' ? 1 : undefined, height: n ? Math.max(3, (n / max) * height) : 2 }}
        />
      ))}
    </span>
  )
}

type EditorProps = {
  focus: boolean
  usage?: Use
  usageKnown: boolean
  logging: boolean
  onLog: (kind: Kind, template: Template) => void
  onSaved: (kind: Kind, id: number) => void
  onDeleted: () => void
  onCancel: () => void
  /** In the aside, with its own tinted head; in a dialog, the dialog's title stands for it. */
  framed: boolean
}

function EditorShell({
  kind,
  title,
  name,
  setName,
  focus,
  onCancel,
  usage,
  usageKnown,
  children,
  error,
  busy,
  logging,
  dirty,
  isNew,
  framed,
  onSubmit,
  onLog,
  onDelete,
}: {
  kind: Kind
  title: string
  name: string
  setName: (value: string) => void
  focus: boolean
  onCancel: () => void
  usage?: Use
  usageKnown: boolean
  children: ReactNode
  error: string
  busy: boolean
  logging: boolean
  dirty: boolean
  isNew: boolean
  framed: boolean
  onSubmit: (event: FormEvent) => void
  onLog: () => void
  onDelete: () => void
}) {
  const t = useTranslations('habits.templates')
  const tCommon = useTranslations('habits.common')
  const tShared = useTranslations('common')
  const f = useFormat()
  const KindIcon = kind === 'food' ? UtensilsCrossed : Activity
  return (
    <form onSubmit={onSubmit} noValidate className={cn('flex min-h-0 flex-1 flex-col', toneOf(kind))}>
      {framed ? (
        <CardHead>
          <h2 className="flex flex-1 items-center gap-2 text-sm font-semibold text-(--tone-ink)">
            <KindIcon size={16} strokeWidth={2.25} aria-hidden="true" />
            {title}
          </h2>
        </CardHead>
      ) : null}
      <div className="flex flex-col gap-4 p-5">
        <Input
          id="t-name"
          label={t('name')}
          autoFocus={focus}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder={kind === 'food' ? t('food.namePlaceholder') : t('exercise.namePlaceholder')}
          autoComplete="off"
        />
        {children}
        {!isNew && usageKnown ? (
          <div className="rounded-[10px] border border-line bg-surface px-4 py-3">
            {usage?.count ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="flex-1 text-sm font-medium text-ink">{t('usedTimes', { count: usage.count, days: USAGE_DAYS })}</span>
                  <span className="text-xs text-ink-muted">{t('last', { date: lastUsed(f, usage.last) })}</span>
                </div>
                <div className="mt-3">
                  <Spark weeks={usage.weeks} height={44} gap={5} width="fill" />
                </div>
              </>
            ) : (
              <span className="text-[13px] text-ink-muted">
                {usage ? t('notLoggedSince', { days: USAGE_DAYS, date: lastUsed(f, usage.last) }) : t('notLogged', { days: USAGE_DAYS })}
              </span>
            )}
          </div>
        ) : null}
        <FormError>{error}</FormError>
      </div>
      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-3">
        {isNew ? (
          <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
            {tShared('cancel')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={busy} className="-ml-2 text-danger hover:bg-danger-soft" aria-label={t('delete')}>
            {tCommon('delete')}
          </Button>
        )}
        <span className="flex-1" />
        {!isNew ? (
          <Button variant="outline" size="sm" onClick={onLog} disabled={busy || logging}>
            {t('logToday')}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={busy || (!isNew && !dirty)}>
          {busy ? tCommon('saving') : isNew ? t('create') : tCommon('saveChanges')}
        </Button>
      </div>
    </form>
  )
}

function UnitField({
  id,
  label,
  unit,
  value: text,
  onChange,
  placeholder,
  inputMode = 'numeric',
}: {
  id: string
  label: string
  unit?: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputMode?: 'numeric' | 'decimal'
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(fieldClasses, 'h-11 px-3.5 font-mono text-base tabular-nums placeholder:font-sans sm:h-10 sm:text-sm', unit && 'pr-12')}
          inputMode={inputMode}
          value={text}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {unit ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-muted">{unit}</span> : null}
      </div>
    </div>
  )
}

function WorkoutEditor({ item, focus, usage, usageKnown, logging, onLog, onSaved, onDeleted, onCancel, framed }: { item: WorkoutTemplate | null } & EditorProps) {
  const t = useTranslations('habits.templates.exercise')
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const labels = useLabels()
  const apiError = useApiError()
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [type, setType] = useState(item?.type ?? 'cardio')
  const [mins, setMins] = useState(item ? String(item.minutes) : '')
  const [kcal, setKcal] = useState(item?.calories ? String(item.calories) : '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty =
    !item ||
    name !== item.name ||
    type !== item.type ||
    mins !== String(item.minutes) ||
    kcal !== (item.calories ? String(item.calories) : '') ||
    notes !== (item.notes ?? '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = parseIntStrict(mins)
    const calories = kcal.trim() ? parseIntStrict(kcal) : 0
    if (!name.trim()) return setError(tValidation('workoutName'))
    if (!(minutes > 0 && minutes <= 1440)) return setError(tValidation('duration'))
    if (!(calories >= 0)) return setError(tValidation('caloriesBurned'))
    setBusy(true)
    try {
      const data = { name: name.trim(), minutes, calories, type, notes: notes.trim() || null }
      const saved = item ? await api.updateWorkoutTemplate(item.id, data) : await api.addWorkoutTemplate(data)
      toast.show(item ? tToasts('templateSaved') : tToasts('created', { name: data.name }), 'success')
      bumpData()
      onSaved('exercise', saved.id)
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!item) return
    try {
      await api.deleteWorkoutTemplate(item.id)
      bumpData()
      onDeleted()
      toast.show(tToasts('deleted', { name: item.name }), 'info', {
        label: tCommon('undo'),
        run: () => {
          api
            .addWorkoutTemplate({ name: item.name, minutes: item.minutes, calories: item.calories, type: item.type, notes: item.notes })
            .then(bumpData)
            .catch(caught => toast.show(apiError(caught, 'saveFailed'), 'error'))
        },
      })
    } catch (caught) {
      setError(apiError(caught, 'deleteFailed'))
    }
  }

  return (
    <EditorShell
      kind="exercise"
      title={item ? t('edit') : t('new')}
      name={name}
      setName={next => {
        setName(next)
        setError('')
      }}
      focus={focus}
      onCancel={onCancel}
      usage={usage}
      usageKnown={usageKnown}
      error={error}
      busy={busy}
      logging={logging}
      dirty={dirty}
      isNew={!item}
      framed={framed}
      onSubmit={submit}
      onLog={() => {
        if (item) onLog('exercise', item)
      }}
      onDelete={() => void remove()}
    >
      <Select
        id="t-type"
        label={t('type')}
        value={type}
        onChange={event => setType(event.target.value)}
        options={EXERCISE_TYPES.map(option => ({ value: option, label: labels.exerciseType(option) }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <UnitField
          id="t-mins"
          label={t('duration')}
          unit="min"
          value={mins}
          onChange={next => {
            setMins(next)
            setError('')
          }}
          placeholder="45"
        />
        <UnitField
          id="t-kcal"
          label={t('caloriesBurned')}
          unit="kcal"
          value={kcal}
          onChange={next => {
            setKcal(next)
            setError('')
          }}
          placeholder={tCommon('optional')}
        />
      </div>
      <Textarea id="t-notes" label={t('notes')} rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder={t('notesPlaceholder')} />
    </EditorShell>
  )
}

function MealEditor({ item, focus, usage, usageKnown, logging, onLog, onSaved, onDeleted, onCancel, framed }: { item: MealTemplate | null } & EditorProps) {
  const t = useTranslations('habits.templates.food')
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const labels = useLabels()
  const apiError = useApiError()
  const toast = useToast()
  const savedQty = item ? f.num(item.quantity) : '1'
  const [name, setName] = useState(item?.name ?? '')
  const [meal, setMeal] = useState(item?.mealType ?? 'breakfast')
  const [kcal, setKcal] = useState(item ? String(item.calories) : '')
  const [qty, setQty] = useState(savedQty)
  const [desc, setDesc] = useState(item?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = !item || name !== item.name || meal !== item.mealType || kcal !== String(item.calories) || qty !== savedQty || desc !== (item.description ?? '')
  const total = Math.round((parseIntStrict(kcal) || 0) * (parseDecimal(qty) || 0))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const calories = parseIntStrict(kcal)
    const quantity = parseDecimal(qty || '1')
    if (!name.trim()) return setError(tValidation('mealName'))
    if (!(calories > 0)) return setError(tValidation('calories'))
    if (!(quantity > 0 && quantity < 1000)) return setError(tValidation('servings'))
    setBusy(true)
    try {
      const data = { name: name.trim(), calories, quantity: Math.round(quantity * 100) / 100, mealType: meal, description: desc.trim() || null }
      const saved = item ? await api.updateMealTemplate(item.id, data) : await api.addMealTemplate(data)
      toast.show(item ? tToasts('templateSaved') : tToasts('created', { name: data.name }), 'success')
      bumpData()
      onSaved('food', saved.id)
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!item) return
    try {
      await api.deleteMealTemplate(item.id)
      bumpData()
      onDeleted()
      toast.show(tToasts('deleted', { name: item.name }), 'info', {
        label: tCommon('undo'),
        run: () => {
          api
            .addMealTemplate({ name: item.name, calories: item.calories, quantity: item.quantity, mealType: item.mealType, description: item.description })
            .then(bumpData)
            .catch(caught => toast.show(apiError(caught, 'saveFailed'), 'error'))
        },
      })
    } catch (caught) {
      setError(apiError(caught, 'deleteFailed'))
    }
  }

  return (
    <EditorShell
      kind="food"
      title={item ? t('edit') : t('new')}
      name={name}
      setName={next => {
        setName(next)
        setError('')
      }}
      focus={focus}
      onCancel={onCancel}
      usage={usage}
      usageKnown={usageKnown}
      error={error}
      busy={busy}
      logging={logging}
      dirty={dirty}
      isNew={!item}
      framed={framed}
      onSubmit={submit}
      onLog={() => {
        if (item) onLog('food', item)
      }}
      onDelete={() => void remove()}
    >
      <Select id="t-meal" label={t('meal')} value={meal} onChange={event => setMeal(event.target.value)} options={MEAL_TYPES.map(option => ({ value: option, label: labels.meal(option) }))} />
      <div>
        <div className="grid grid-cols-2 gap-3">
          <UnitField
            id="t-kcal"
            label={t('kcalPerServing')}
            unit="kcal"
            value={kcal}
            onChange={next => {
              setKcal(next)
              setError('')
            }}
            placeholder="350"
          />
          <UnitField
            id="t-qty"
            label={t('servings')}
            value={qty}
            onChange={next => {
              setQty(next)
              setError('')
            }}
            placeholder="1"
            inputMode="decimal"
          />
        </div>
        {total > 0 ? <p className="mt-2 text-[12.5px] text-ink-muted">{t.rich('total', { kcal: f.int(total), v: chunks => <Num className="text-ink">{chunks}</Num> })}</p> : null}
      </div>
      <Textarea id="t-desc" label={t('description')} rows={2} value={desc} onChange={event => setDesc(event.target.value)} placeholder={t('descriptionPlaceholder')} />
    </EditorShell>
  )
}
