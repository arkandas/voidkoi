'use client'

import { Plus, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { Button, IconButton, Segmented, fieldClasses, labelClasses, useToast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addDays, dayKey } from '@/lib/days'
import { useApiError } from '@/lib/use-api-error'
import { api } from '@/modules/habits/lib/api'
import type { DayDto, MealTemplate, WorkoutTemplate } from '@/modules/habits/lib/api-types'
import { bumpData, useDataVersion, useRange, useTemplates } from '@/modules/habits/lib/data'
import { historyRange, type DayKey } from '@/modules/habits/lib/dates'
import { parseDecimal, parseIntStrict } from '@/modules/habits/lib/format'
import { entryKcal, EXERCISE_TYPES, MEAL_TYPES, mealForHour, WEIGHT_RANGE, type Metric } from '@/modules/habits/lib/metrics'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useLabels } from '@/modules/habits/lib/use-labels'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { FormError, Num, TabStrip, toneClass } from './bits'
import { WeightStepper } from './day-panel'

/** Quick logging for today or yesterday: a weigh-in, food or a workout. */
export function LogPanel({ tab: initialTab, onClose }: { tab: Metric; onClose: () => void }) {
  const t = useTranslations('habits.log')
  const tTabs = useTranslations('habits.log.tabs')
  const tCommon = useTranslations('habits.common')
  const tShared = useTranslations('common')
  const tracks = useTracks()
  const today = dayKey(new Date())
  const yesterday = addDays(today, -1)
  const [tab, setTab] = useState<Metric>(initialTab)
  const [day, setDay] = useState<DayKey>(today)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-drag-zone className="flex shrink-0 touch-none items-center gap-2 px-4 pt-1 pb-3 md:touch-auto md:pt-4">
        {tracks.list.length > 1 ? (
          <TabStrip<Metric>
            label={t('whatToLog')}
            value={tab}
            onChange={setTab}
            controls="log-panel-body"
            className="min-w-0 flex-1"
            items={tracks.list.map(key => ({ value: key, label: tTabs(key) }))}
          />
        ) : (
          <h2 className="min-w-0 flex-1 text-base font-semibold text-ink">{tTabs(tab)}</h2>
        )}
        <IconButton size="sm" label={tShared('close')} icon={<X size={17} />} onClick={onClose} className="-mr-1.5" />
      </div>

      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        <Segmented<'today' | 'yesterday'>
          ariaLabel={t('day')}
          value={day === today ? 'today' : 'yesterday'}
          onChange={choice => setDay(choice === 'today' ? today : yesterday)}
          options={[
            { value: 'today', label: tCommon('today') },
            { value: 'yesterday', label: tCommon('yesterday') },
          ]}
        />
      </div>

      <div
        id="log-panel-body"
        role="tabpanel"
        className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        {tab === 'weight' ? (
          <WeightForm key={day} day={day} today={today} onDone={onClose} />
        ) : tab === 'food' ? (
          <FoodForm key={day} day={day} today={today} />
        ) : (
          <WorkoutForm key={day} day={day} />
        )}
      </div>
    </div>
  )
}

/** The day as saved, loaded again after every change. */
function useDay(day: DayKey) {
  const version = useDataVersion()
  const [state, setState] = useState<{ day: DayKey; summary: DayDto } | null>(null)
  useEffect(() => {
    let alive = true
    api
      .day(day)
      .then(summary => {
        if (alive) setState({ day, summary })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [day, version])
  return state?.day === day ? state.summary : null
}

function useUndo() {
  const toast = useToast()
  const tCommon = useTranslations('habits.common')
  const apiError = useApiError()
  return (message: string, undo: () => Promise<unknown>) =>
    toast.show(message, 'info', {
      label: tCommon('undo'),
      run: () => {
        undo()
          .then(bumpData)
          .catch(error => toast.show(apiError(error, 'saveFailed'), 'error'))
      },
    })
}

function WeightForm({ day, today, onDone }: { day: DayKey; today: DayKey; onDone: () => void }) {
  const t = useTranslations('habits.log.weight')
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const apiError = useApiError()
  const toast = useToast()
  const undo = useUndo()
  const range = historyRange(today)
  const { data } = useRange(range.start, range.end)
  const weights = useMemo(() => data?.weights.filter(w => w.key <= day) ?? [], [data, day])
  const existing = weights.at(-1)?.key === day ? weights.at(-1)! : null
  const before = weights.filter(w => w.key < day).at(-1) ?? null
  const [typed, setTyped] = useState<string | null>(null)
  const shown = typed ?? (existing ? f.kg(existing.weight) : before ? f.kg(before.weight) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const step = (by: number) => {
    const current = parseDecimal(shown)
    setTyped(f.kg(Math.max(0, Math.round(((Number.isFinite(current) ? current : (before?.weight ?? 75)) + by) * 10) / 10)))
    setError('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const kg = Math.round(parseDecimal(shown) * 100) / 100
    if (!(kg >= WEIGHT_RANGE[0] && kg <= WEIGHT_RANGE[1])) return setError(tValidation('weight', { example: f.kg(78.4) }))
    setBusy(true)
    try {
      await api.saveWeight(day, kg)
      bumpData()
      toast.show(tToasts('weightSaved', { kg: f.kg(kg) }), 'success')
      onDone()
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    try {
      await api.deleteWeight(day)
      bumpData()
      undo(tToasts('weighInDeleted'), () => api.saveWeight(day, existing.weight))
    } catch (caught) {
      setError(apiError(caught, 'deleteFailed'))
    }
  }

  return (
    <form onSubmit={save} noValidate className={toneClass('weight')}>
      <label htmlFor="log-weight" className={labelClasses}>
        {day === today ? t('thisMorning') : t('weighIn')}
      </label>
      <WeightStepper
        id="log-weight"
        size="lg"
        autoFocus
        value={shown}
        onChange={next => {
          setTyped(next)
          setError('')
        }}
        onStep={step}
        step={0.1}
        invalid={!!error}
        placeholder={f.kg(75)}
      />
      <p className="mt-2 text-xs text-ink-muted">
        {before ? t('previous', { when: f.relative(before.key, today), kg: f.kg(before.weight) }) : t('first')}
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" fullWidth className="mt-4" disabled={busy || !shown.trim()}>
        {busy ? tCommon('saving') : existing ? t('update') : t('save')}
      </Button>
      {existing ? (
        <Button variant="ghost" fullWidth className="mt-1 text-danger hover:bg-danger-soft" onClick={() => void remove()}>
          {t('delete')}
        </Button>
      ) : null}
    </form>
  )
}

function FoodForm({ day, today }: { day: DayKey; today: DayKey }) {
  const t = useTranslations('habits.log.food')
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const labels = useLabels()
  const apiError = useApiError()
  const undo = useUndo()
  const summary = useDay(day)
  const { templates: saved } = useTemplates(true, false)
  const templates = useMemo(() => saved?.meals ?? [], [saved])
  const [query, setQuery] = useState('')
  const [kcal, setKcal] = useState('')
  const [qty, setQty] = useState('1')
  const [meal, setMeal] = useState<string>(day === today ? mealForHour(new Date().getHours()) : 'other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const kcalRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toLowerCase()
  const matches = q ? templates.filter(template => template.name.toLowerCase().includes(q)) : templates
  const custom = q.length > 0 && !templates.some(template => template.name.toLowerCase() === q)

  const add = async (data: { name: string; calories: number; quantity: number; mealType: string }) => {
    setBusy(true)
    try {
      const created = await api.addFood({ date: day, ...data })
      bumpData()
      setQuery('')
      setKcal('')
      setQty('1')
      setError('')
      undo(tToasts('added', { name: data.name }), () => api.deleteFood(created.id))
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const addTemplate = (template: MealTemplate) => add({ name: template.name, calories: template.calories, quantity: template.quantity, mealType: template.mealType })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!q || busy) return
    if (matches[0] && !kcal.trim()) return void addTemplate(matches[0])
    const calories = parseIntStrict(kcal)
    const quantity = parseDecimal(qty || '1')
    if (!(calories > 0)) {
      setError(tValidation('calories'))
      kcalRef.current?.focus()
      return
    }
    if (!(quantity > 0 && quantity < 1000)) return setError(tValidation('servings'))
    void add({ name: query.trim(), calories, quantity: Math.round(quantity * 100) / 100, mealType: meal })
  }
  const remove = async (id: number, name: string, restore: () => Promise<unknown>) => {
    try {
      await api.deleteFood(id)
      bumpData()
      undo(tToasts('deleted', { name }), restore)
    } catch (caught) {
      setError(apiError(caught, 'deleteFailed'))
    }
  }

  const fieldSmall = cn(fieldClasses, 'h-11 px-3 text-base sm:h-10 sm:text-sm')
  return (
    <div className={toneClass('food')}>
      <form onSubmit={submit} noValidate>
        <label htmlFor="log-food" className={labelClasses}>
          {t('name')}
        </label>
        <input
          id="log-food"
          autoFocus
          className={cn(fieldClasses, 'h-11 px-3.5 text-base sm:h-10 sm:text-sm')}
          placeholder={t('search')}
          value={query}
          autoComplete="off"
          enterKeyHint="done"
          onChange={event => {
            setQuery(event.target.value)
            setError('')
          }}
        />
        {custom ? (
          <div className="mt-3 grid grid-cols-[1fr_4.5rem_7rem] gap-2">
            <div>
              <label htmlFor="log-kcal" className={labelClasses}>
                {t('kcalPerServing')}
              </label>
              <input
                ref={kcalRef}
                id="log-kcal"
                className={cn(fieldSmall, 'font-mono tabular-nums')}
                inputMode="numeric"
                value={kcal}
                onChange={event => {
                  setKcal(event.target.value)
                  setError('')
                }}
                placeholder="350"
              />
            </div>
            <div>
              <label htmlFor="log-qty" className={labelClasses}>
                {t('servings')}
              </label>
              <input id="log-qty" className={cn(fieldSmall, 'font-mono tabular-nums')} inputMode="decimal" value={qty} onChange={event => setQty(event.target.value)} />
            </div>
            <div>
              <label htmlFor="log-meal" className={labelClasses}>
                {t('meal')}
              </label>
              <select id="log-meal" className={cn(fieldSmall, 'cursor-pointer pr-2')} value={meal} onChange={event => setMeal(event.target.value)}>
                {MEAL_TYPES.map(type => (
                  <option key={type} value={type}>
                    {labels.meal(type)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy} className="col-span-3">
              {t('addNamed', { name: query.trim() })}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </form>

      {matches.length > 0 ? (
        <ul aria-label={t('templates')} className="mt-3 divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card">
          {matches.slice(0, 8).map(template => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => void addTemplate(template)}
                disabled={busy}
                className="flex h-11 w-full items-center gap-3 px-3 text-left text-sm text-ink hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate">{template.name}</span>
                <span className="text-xs text-ink-muted">{labels.meal(template.mealType)}</span>
                <Num className="w-16 text-right text-(--tone-ink)">{f.int(entryKcal(template))}</Num>
                <Plus size={14} className="text-ink-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <DayList
        title={day === today ? tCommon('today') : t('thisDay')}
        total={summary ? `${f.int(summary.foods.reduce((sum, food) => sum + entryKcal(food), 0))} kcal` : ''}
        rows={
          summary?.foods.map(food => ({
            id: food.id,
            name: food.name,
            sub: labels.meal(food.mealType) + (food.quantity !== 1 ? ` · ${f.num(food.quantity)} ×` : ''),
            value: f.int(entryKcal(food)),
            onDelete: () =>
              void remove(food.id, food.name, () =>
                api.addFood({ date: day, name: food.name, calories: food.calories, quantity: food.quantity, mealType: food.mealType }),
              ),
          })) ?? null
        }
      />
    </div>
  )
}

function WorkoutForm({ day }: { day: DayKey }) {
  const t = useTranslations('habits.log.training')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const labels = useLabels()
  const apiError = useApiError()
  const undo = useUndo()
  const summary = useDay(day)
  const { templates: saved } = useTemplates(false, true)
  const templates = saved?.workouts ?? []
  const [name, setName] = useState('')
  const [mins, setMins] = useState('')
  const [type, setType] = useState('other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const add = async (data: { name: string; minutes: number; caloriesBurned: number; type: string; notes?: string | null }) => {
    setBusy(true)
    try {
      const created = await api.addWorkout({ date: day, ...data })
      bumpData()
      setName('')
      setMins('')
      setError('')
      undo(tToasts('added', { name: data.name }), () => api.deleteWorkout(created.id))
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  const addTemplate = (template: WorkoutTemplate) =>
    add({ name: template.name, minutes: template.minutes, caloriesBurned: template.calories, type: template.type, notes: template.notes })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const minutes = parseIntStrict(mins)
    if (!name.trim()) return setError(tValidation('workoutName'))
    if (!(minutes > 0 && minutes <= 1440)) return setError(tValidation('duration'))
    void add({ name: name.trim(), minutes, caloriesBurned: 0, type })
  }
  const remove = async (id: number, label: string, restore: () => Promise<unknown>) => {
    try {
      await api.deleteWorkout(id)
      bumpData()
      undo(tToasts('deleted', { name: label }), restore)
    } catch (caught) {
      setError(apiError(caught, 'deleteFailed'))
    }
  }

  const field = cn(fieldClasses, 'h-11 px-3.5 text-base sm:h-10 sm:text-sm')
  return (
    <div className={toneClass('exercise')}>
      {templates.length > 0 ? (
        <>
          <p className={labelClasses}>{t('fromTemplates')}</p>
          <ul aria-label={t('templates')} className="mb-4 divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card">
            {templates.map(template => (
              <li key={template.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addTemplate(template)}
                  className="flex h-11 w-full items-center gap-3 px-3 text-left text-sm text-ink hover:bg-muted disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate">{template.name}</span>
                  <span className="text-xs text-ink-muted">{labels.exerciseType(template.type)}</span>
                  <Num className="w-16 text-right text-(--tone-ink)">{f.duration(template.minutes)}</Num>
                  <Plus size={14} className="text-ink-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <form onSubmit={submit} noValidate className="grid grid-cols-[1fr_5rem] gap-2">
        <div>
          <label htmlFor="log-ex" className={labelClasses}>
            {t('name')}
          </label>
          <input
            id="log-ex"
            autoFocus={!templates.length}
            className={field}
            value={name}
            onChange={event => {
              setName(event.target.value)
              setError('')
            }}
            placeholder={t('namePlaceholder')}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="log-min" className={labelClasses}>
            {t('minutes')}
          </label>
          <input
            id="log-min"
            className={cn(field, 'font-mono tabular-nums')}
            inputMode="numeric"
            value={mins}
            onChange={event => {
              setMins(event.target.value)
              setError('')
            }}
            placeholder="45"
          />
        </div>
        <div className="col-span-2">
          <label htmlFor="log-type" className={labelClasses}>
            {t('type')}
          </label>
          <select id="log-type" className={cn(field, 'cursor-pointer')} value={type} onChange={event => setType(event.target.value)}>
            {EXERCISE_TYPES.map(option => (
              <option key={option} value={option}>
                {labels.exerciseType(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <FormError>{error}</FormError>
        </div>
        <Button type="submit" disabled={busy} className="col-span-2">
          {t('add')}
        </Button>
      </form>

      <DayList
        title={t('logged')}
        total={summary ? f.duration(summary.workouts.reduce((sum, w) => sum + w.minutes, 0)) : ''}
        rows={
          summary?.workouts.map(workout => ({
            id: workout.id,
            name: workout.name,
            sub: labels.exerciseType(workout.type),
            value: f.duration(workout.minutes),
            onDelete: () =>
              void remove(workout.id, workout.name, () =>
                api.addWorkout({
                  date: workout.date,
                  name: workout.name,
                  minutes: workout.minutes,
                  caloriesBurned: workout.caloriesBurned,
                  type: workout.type,
                  notes: workout.notes,
                }),
              ),
          })) ?? null
        }
      />
    </div>
  )
}

function DayList({
  title,
  total,
  rows,
}: {
  title: string
  total: string
  rows: { id: number; name: string; sub: string; value: string; onDelete: () => void }[] | null
}) {
  const tCommon = useTranslations('habits.common')
  if (!rows?.length) return null
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <Num className="text-xs text-ink-muted">{total}</Num>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card">
        {rows.map(row => (
          <li key={row.id} className="flex h-11 items-center gap-3 pr-1 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">
              {row.name} <span className="text-xs text-ink-muted">{row.sub}</span>
            </span>
            <Num className="text-ink-muted">{row.value}</Num>
            <IconButton
              size="sm"
              label={tCommon('deleteNamed', { name: row.name })}
              icon={<Trash2 size={14} />}
              onClick={row.onDelete}
              className="text-ink-faint hover:bg-danger-soft hover:text-danger"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
