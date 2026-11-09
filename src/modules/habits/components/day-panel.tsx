'use client'

import { ChevronLeft, ChevronRight, Minus, Plus, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button, IconButton, Input, Select, fieldClasses, labelClasses, useToast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addDays, dayKey } from '@/lib/days'
import { useApiError } from '@/lib/use-api-error'
import { api } from '@/modules/habits/lib/api'
import type { DayDto, FoodEntry, MealTemplate, WeighIn, Workout, WorkoutTemplate } from '@/modules/habits/lib/api-types'
import { bumpData, useDataVersion, useTemplates } from '@/modules/habits/lib/data'
import type { DayKey } from '@/modules/habits/lib/dates'
import { parseDecimal, parseIntStrict } from '@/modules/habits/lib/format'
import { entryKcal, EXERCISE_TYPES, MEAL_TYPES, mealForHour, WEIGHT_RANGE, type Metric } from '@/modules/habits/lib/metrics'
import { openDay, setDayTab } from '@/modules/habits/lib/nav'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useLabels } from '@/modules/habits/lib/use-labels'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { FormError, Num, SectionTitle, Skeleton, Stat, TabStrip, toneClass, value } from './bits'

/** A day's weigh-in, food and workouts, each in its tab. */
export function DayPanel({ day, tab, onClose }: { day: DayKey; tab: Metric; onClose: () => void }) {
  const t = useTranslations('habits.day')
  const tTabs = useTranslations('habits.metrics')
  const tCommon = useTranslations('common')
  const apiError = useApiError()
  const f = useFormat()
  const tracks = useTracks()
  const version = useDataVersion()
  const [state, setState] = useState<{ day: DayKey; summary: DayDto } | null>(null)
  const [failed, setFailed] = useState<{ day: DayKey; error: unknown } | null>(null)
  const { templates } = useTemplates(tracks.food, tracks.training)

  useEffect(() => {
    let alive = true
    api
      .day(day)
      .then(summary => {
        if (alive) {
          setState({ day, summary })
          setFailed(null)
        }
      })
      .catch(error => {
        if (alive) setFailed({ day, error })
      })
    return () => {
      alive = false
    }
  }, [day, version])

  const today = dayKey(new Date())
  const summary = state?.day === day ? state.summary : null
  const minutes = summary?.workouts.reduce((sum, w) => sum + w.minutes, 0) ?? 0
  const values: Record<Metric, string | null> = {
    weight: summary?.weight != null ? f.kg(summary.weight) : null,
    food: summary?.foods.length ? f.int(summary.foods.reduce((sum, food) => sum + entryKcal(food), 0)) : null,
    training: summary?.workouts.length ? f.duration(minutes) : null,
  }
  const failure = failed?.day === day ? failed : null

  return (
    <>
      <header data-drag-zone className="shrink-0 touch-none px-4 pt-1 pb-4 md:touch-auto md:px-5 md:pt-4">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <h2 id="day-panel-title" className="truncate text-base font-semibold tracking-[-0.01em] text-ink">
              {f.title(f.date(day, 'mediumDate'))}
            </h2>
            <p className={cn('text-[13px]', day === today ? 'font-medium text-accent' : 'text-ink-muted')}>{f.relative(day, today)}</p>
          </div>
          <IconButton size="sm" label={t('previousDay')} icon={<ChevronLeft size={18} />} onClick={() => openDay(addDays(day, -1), tab)} />
          <IconButton size="sm" label={t('nextDay')} icon={<ChevronRight size={18} />} onClick={() => openDay(addDays(day, 1), tab)} />
          <IconButton size="sm" label={tCommon('close')} icon={<X size={18} />} onClick={onClose} className="-mr-1.5" />
        </div>

        {tracks.list.length > 1 ? (
          <TabStrip<Metric>
            label={t('section')}
            value={tab}
            onChange={setDayTab}
            controls="day-panel-body"
            className="mt-3"
            items={tracks.list.map(key => ({
              value: key,
              label: tTabs(key),
              detail: (
                <Num className={cn('block truncate text-sm', values[key] ? 'text-ink' : 'text-ink-faint')}>
                  {summary ? (values[key] ?? '—') : <Skeleton className="mx-auto mt-1 h-3.5 w-9" />}
                </Num>
              ),
            }))}
          />
        ) : null}
      </header>

      <div
        id="day-panel-body"
        role="tabpanel"
        className="themed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-5"
      >
        {failure && !summary ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{apiError(failure.error, 'loadFailed')}</p>
        ) : !summary ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-[10px]" />
            <Skeleton className="h-12 rounded-[10px]" />
            <Skeleton className="h-12 rounded-[10px]" />
          </div>
        ) : tab === 'weight' ? (
          <WeightTab key={`${day}:${summary.weight ?? ''}`} day={day} weight={summary.weight} previous={summary.previous} />
        ) : tab === 'food' ? (
          <FoodTab
            key={day}
            day={day}
            isToday={day === today}
            entries={summary.foods}
            burned={tracks.training ? summary.workouts.reduce((sum, w) => sum + w.caloriesBurned, 0) : 0}
            templates={templates?.meals ?? []}
          />
        ) : (
          <WorkoutTab key={day} day={day} entries={summary.workouts} templates={templates?.workouts ?? []} />
        )}
      </div>
    </>
  )
}

/** "Deleted X" with Undo, which puts it back. */
function useUndoToast() {
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

/** −, the field, +: a weight typed or stepped a little at a time. */
export function WeightStepper({
  id,
  value: text,
  onChange,
  onStep,
  step,
  invalid,
  size = 'md',
  autoFocus,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onStep: (delta: number) => void
  step: number
  invalid?: boolean
  size?: 'md' | 'lg'
  autoFocus?: boolean
  placeholder: string
}) {
  const t = useTranslations('habits.common')
  const f = useFormat()
  const height = size === 'lg' ? 'h-13' : 'h-10'
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className={cn(height, 'w-11 shrink-0 px-0')}
        onClick={() => onStep(-step)}
        aria-label={t('decrease', { step: f.kg(step) })}
      >
        <Minus size={16} />
      </Button>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          autoFocus={autoFocus}
          className={cn(
            fieldClasses,
            height,
            'px-10 text-center font-mono tabular-nums',
            size === 'lg' ? 'text-[26px]' : 'text-[17px]',
            invalid && 'border-danger',
          )}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={text}
          onChange={event => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-muted">kg</span>
      </div>
      <Button
        variant="outline"
        className={cn(height, 'w-11 shrink-0 px-0')}
        onClick={() => onStep(step)}
        aria-label={t('increase', { step: f.kg(step) })}
      >
        <Plus size={16} />
      </Button>
    </div>
  )
}

function WeightTab({ day, weight, previous }: { day: DayKey; weight: number | null; previous: WeighIn | null }) {
  const t = useTranslations('habits.day.weight')
  const tCommon = useTranslations('habits.common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const apiError = useApiError()
  const toast = useToast()
  const undoToast = useUndoToast()
  const [text, setText] = useState(weight != null ? f.kg(weight) : previous ? f.kg(previous.weight) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const delta = weight != null && previous ? weight - previous.weight : null

  const step = (by: number) => {
    const typed = parseDecimal(text)
    const base = Number.isFinite(typed) ? typed : (weight ?? previous?.weight ?? 70)
    setText(f.kg(Math.max(0, Math.round((base + by) * 10) / 10)))
    setError('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const kg = Math.round(parseDecimal(text) * 100) / 100
    if (!(kg >= WEIGHT_RANGE[0] && kg <= WEIGHT_RANGE[1])) {
      setError(tValidation('weight', { example: f.kg(78.4) }))
      return
    }
    setSaving(true)
    try {
      await api.saveWeight(day, kg)
      toast.show(tToasts('weightSaved', { kg: f.kg(kg) }), 'success')
      bumpData()
    } catch (caught) {
      toast.show(apiError(caught, 'saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (weight == null) return
    try {
      await api.deleteWeight(day)
      bumpData()
      undoToast(tToasts('weighInDeleted'), () => api.saveWeight(day, weight))
    } catch (caught) {
      toast.show(apiError(caught, 'deleteFailed'), 'error')
    }
  }

  return (
    <div className={cn(toneClass('weight'), 'space-y-5')}>
      <div className="flex items-start justify-between gap-3 rounded-[10px] border border-line bg-card px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-muted">{weight != null ? t('weighIn') : t('none')}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <Num className="text-[36px] leading-none font-medium tracking-[-0.03em] text-ink">{weight != null ? f.kg(weight) : '—'}</Num>
            <span className="text-ink-muted">kg</span>
          </div>
          {previous ? (
            <p className="mt-2 text-[13px] text-ink-muted">
              {t.rich('previous', { kg: f.kg(previous.weight), date: f.date(previous.date, 'monthDay'), v: value })}
              {delta != null ? (
                <>
                  {' · '}
                  <Num className="whitespace-nowrap text-(--tone-ink)">{f.delta(delta)} kg</Num>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {weight != null ? (
          <IconButton size="sm" label={t('delete')} icon={<Trash2 size={16} />} onClick={() => void remove()} className="-mt-1 -mr-2 hover:bg-danger-soft hover:text-danger" />
        ) : null}
      </div>

      <form onSubmit={save} className="space-y-3" noValidate>
        <label htmlFor="weight-input" className={labelClasses}>
          {weight != null ? t('update') : t('log')}
        </label>
        <WeightStepper
          id="weight-input"
          value={text}
          onChange={next => {
            setText(next)
            setError('')
          }}
          onStep={step}
          step={0.1}
          invalid={!!error}
          placeholder={f.kg(75)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" fullWidth disabled={saving || !text.trim()}>
          {saving ? tCommon('saving') : weight != null ? t('update') : t('save')}
        </Button>
      </form>
    </div>
  )
}

function FoodTab({
  day,
  isToday,
  entries,
  burned,
  templates,
}: {
  day: DayKey
  isToday: boolean
  entries: FoodEntry[]
  burned: number
  templates: MealTemplate[]
}) {
  const t = useTranslations('habits.day.food')
  const tCommon = useTranslations('habits.common')
  const tShared = useTranslations('common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const labels = useLabels()
  const apiError = useApiError()
  const toast = useToast()
  const undoToast = useUndoToast()
  const formRef = useRef<HTMLFormElement>(null)
  const defaultMeal = isToday ? mealForHour(new Date().getHours()) : 'other'
  const [editing, setEditing] = useState<FoodEntry | null>(null)
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [qty, setQty] = useState('1')
  const [meal, setMeal] = useState<string>(defaultMeal)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const eaten = entries.reduce((sum, food) => sum + entryKcal(food), 0)
  const groups = MEAL_TYPES.map(type => ({
    type,
    items: entries.filter(food => ((MEAL_TYPES as readonly string[]).includes(food.mealType) ? food.mealType : 'other') === type),
  })).filter(group => group.items.length)
  const preview = Math.round((parseIntStrict(kcal) || 0) * (parseDecimal(qty) || 0))

  const reset = () => {
    setEditing(null)
    setName('')
    setKcal('')
    setQty('1')
    setMeal(defaultMeal)
    setError('')
  }

  const startEdit = (food: FoodEntry) => {
    setEditing(food)
    setName(food.name)
    setKcal(String(food.calories))
    setQty(f.num(food.quantity))
    setMeal(food.mealType)
    setError('')
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const calories = parseIntStrict(kcal)
    const quantity = parseDecimal(qty || '1')
    if (!name.trim()) return setError(tValidation('foodName'))
    if (!(calories > 0)) return setError(tValidation('calories'))
    if (!(quantity > 0 && quantity < 1000)) return setError(tValidation('servings'))
    setBusy(true)
    try {
      const data = { name: name.trim(), calories, quantity: Math.round(quantity * 100) / 100, mealType: meal }
      if (editing) {
        await api.updateFood(editing.id, data)
        toast.show(tToasts('foodUpdated'), 'success')
      } else {
        const created = await api.addFood({ date: day, ...data })
        undoToast(tToasts('added', { name: data.name }), () => api.deleteFood(created.id))
      }
      reset()
      bumpData()
    } catch (caught) {
      toast.show(apiError(caught, 'saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const quickAdd = async (template: MealTemplate) => {
    setBusy(true)
    try {
      const created = await api.addFood({ date: day, name: template.name, calories: template.calories, quantity: template.quantity, mealType: template.mealType })
      bumpData()
      undoToast(tToasts('added', { name: template.name }), () => api.deleteFood(created.id))
    } catch (caught) {
      toast.show(apiError(caught, 'saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (food: FoodEntry) => {
    try {
      await api.deleteFood(food.id)
      if (editing?.id === food.id) reset()
      bumpData()
      undoToast(tToasts('deleted', { name: food.name }), () =>
        api.addFood({ date: day, name: food.name, calories: food.calories, quantity: food.quantity, mealType: food.mealType }),
      )
    } catch (caught) {
      toast.show(apiError(caught, 'deleteFailed'), 'error')
    }
  }

  return (
    <div className={cn(toneClass('food'), 'space-y-6')}>
      {entries.length > 0 ? (
        <div className={cn('grid gap-2', burned > 0 ? 'grid-cols-3' : 'grid-cols-1')}>
          <Stat label={burned > 0 ? t('kcalEaten') : t('eaten')} value={burned > 0 ? f.int(eaten) : `${f.int(eaten)} kcal`} tone="food" />
          {burned > 0 ? <Stat label={t('kcalBurned')} value={f.int(burned)} tone="exercise" /> : null}
          {burned > 0 ? <Stat label={t('netKcal')} value={f.int(eaten - burned)} /> : null}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map(group => (
            <section key={group.type}>
              <SectionTitle
                right={
                  <Num className="text-[13px] font-semibold text-ink-muted">{f.int(group.items.reduce((sum, food) => sum + entryKcal(food), 0))} kcal</Num>
                }
              >
                {labels.meal(group.type)}
              </SectionTitle>
              <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card">
                {group.items.map(food => (
                  <EntryRow
                    key={food.id}
                    active={editing?.id === food.id}
                    title={food.name}
                    subtitle={food.quantity !== 1 ? `${f.num(food.quantity)} × ${f.int(food.calories)} kcal` : undefined}
                    shown={f.int(entryKcal(food))}
                    onEdit={() => startEdit(food)}
                    onDelete={() => void remove(food)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <Empty text={t('empty')} />
      )}

      <section>
        <SectionTitle
          right={
            editing ? (
              <button type="button" onClick={reset} className="text-[13px] font-medium text-ink-muted hover:text-ink">
                {tShared('cancel')}
              </button>
            ) : null
          }
        >
          {editing ? t('edit') : t('add')}
        </SectionTitle>
        {!editing && templates.length > 0 ? (
          <TemplateChips
            items={templates.map(template => ({ id: template.id, name: template.name, meta: f.int(entryKcal(template)) }))}
            disabled={busy}
            onPick={id => void quickAdd(templates.find(template => template.id === id)!)}
          />
        ) : null}
        <form ref={formRef} onSubmit={submit} className="space-y-3" noValidate>
          <Input
            id="food-name"
            label={t('name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
              setError('')
            }}
            placeholder={t('namePlaceholder')}
            autoComplete="off"
            enterKeyHint="next"
          />
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label htmlFor="food-kcal" className={labelClasses}>
                {t('calories')} <span className="font-normal text-ink-faint">{t('perServing')}</span>
              </label>
              <input
                id="food-kcal"
                className={cn(fieldClasses, 'h-11 px-3.5 font-mono text-base tabular-nums sm:h-10 sm:text-sm')}
                inputMode="numeric"
                pattern="[0-9]*"
                value={kcal}
                onChange={event => {
                  setKcal(event.target.value)
                  setError('')
                }}
                placeholder="350"
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
            <div>
              <label htmlFor="food-qty" className={labelClasses}>
                {t('servings')}
              </label>
              <input
                id="food-qty"
                className={cn(fieldClasses, 'h-11 px-3.5 font-mono text-base tabular-nums sm:h-10 sm:text-sm')}
                inputMode="decimal"
                value={qty}
                onChange={event => {
                  setQty(event.target.value)
                  setError('')
                }}
                placeholder="1"
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
          </div>
          <Select id="food-meal" label={t('meal')} value={meal} onChange={event => setMeal(event.target.value)} options={MEAL_TYPES.map(type => ({ value: type, label: labels.meal(type) }))} />
          <FormError>{error}</FormError>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? tCommon('saving') : editing ? tCommon('saveChanges') : preview > 0 ? t('addKcal', { kcal: f.int(preview) }) : t('add')}
          </Button>
        </form>
      </section>
    </div>
  )
}

function WorkoutTab({ day, entries, templates }: { day: DayKey; entries: Workout[]; templates: WorkoutTemplate[] }) {
  const t = useTranslations('habits.day.training')
  const tCommon = useTranslations('habits.common')
  const tShared = useTranslations('common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const labels = useLabels()
  const apiError = useApiError()
  const toast = useToast()
  const undoToast = useUndoToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [name, setName] = useState('')
  const [mins, setMins] = useState('')
  const [kcal, setKcal] = useState('')
  const [type, setType] = useState('other')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const total = entries.reduce((sum, w) => sum + w.minutes, 0)
  const burned = entries.reduce((sum, w) => sum + w.caloriesBurned, 0)

  const reset = () => {
    setEditing(null)
    setName('')
    setMins('')
    setKcal('')
    setType('other')
    setNotes('')
    setError('')
  }

  const startEdit = (workout: Workout) => {
    setEditing(workout)
    setName(workout.name)
    setMins(String(workout.minutes))
    setKcal(workout.caloriesBurned ? String(workout.caloriesBurned) : '')
    setType(workout.type)
    setNotes(workout.notes ?? '')
    setError('')
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = parseIntStrict(mins)
    const caloriesBurned = kcal.trim() ? parseIntStrict(kcal) : 0
    if (!name.trim()) return setError(tValidation('workoutName'))
    if (!(minutes > 0 && minutes <= 1440)) return setError(tValidation('duration'))
    if (!(caloriesBurned >= 0)) return setError(tValidation('caloriesBurned'))
    setBusy(true)
    try {
      const data = { name: name.trim(), minutes, caloriesBurned, type, notes: notes.trim() || null }
      if (editing) {
        await api.updateWorkout(editing.id, data)
        toast.show(tToasts('workoutUpdated'), 'success')
      } else {
        const created = await api.addWorkout({ date: day, ...data })
        undoToast(tToasts('added', { name: data.name }), () => api.deleteWorkout(created.id))
      }
      reset()
      bumpData()
    } catch (caught) {
      toast.show(apiError(caught, 'saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const quickAdd = async (template: WorkoutTemplate) => {
    setBusy(true)
    try {
      const created = await api.addWorkout({
        date: day,
        name: template.name,
        minutes: template.minutes,
        caloriesBurned: template.calories,
        type: template.type,
        notes: template.notes,
      })
      bumpData()
      undoToast(tToasts('added', { name: template.name }), () => api.deleteWorkout(created.id))
    } catch (caught) {
      toast.show(apiError(caught, 'saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (workout: Workout) => {
    try {
      await api.deleteWorkout(workout.id)
      if (editing?.id === workout.id) reset()
      bumpData()
      undoToast(tToasts('deleted', { name: workout.name }), () =>
        api.addWorkout({
          date: day,
          name: workout.name,
          minutes: workout.minutes,
          caloriesBurned: workout.caloriesBurned,
          type: workout.type,
          notes: workout.notes,
        }),
      )
    } catch (caught) {
      toast.show(apiError(caught, 'deleteFailed'), 'error')
    }
  }

  return (
    <div className={cn(toneClass('exercise'), 'space-y-6')}>
      {entries.length > 0 ? (
        <div className={cn('grid gap-2', burned > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
          <Stat label={t('sessions', { count: entries.length })} value={f.duration(total)} tone="exercise" />
          {burned > 0 ? <Stat label={t('burned')} value={`${f.int(burned)} kcal`} tone="food" /> : null}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-card">
          {entries.map(workout => (
            <EntryRow
              key={workout.id}
              active={editing?.id === workout.id}
              title={workout.name}
              subtitle={[labels.exerciseType(workout.type), workout.caloriesBurned ? `${f.int(workout.caloriesBurned)} kcal` : null, workout.notes]
                .filter(Boolean)
                .join(' · ')}
              shown={f.duration(workout.minutes)}
              onEdit={() => startEdit(workout)}
              onDelete={() => void remove(workout)}
            />
          ))}
        </ul>
      ) : (
        <Empty text={t('empty')} />
      )}

      <section>
        <SectionTitle
          right={
            editing ? (
              <button type="button" onClick={reset} className="text-[13px] font-medium text-ink-muted hover:text-ink">
                {tShared('cancel')}
              </button>
            ) : null
          }
        >
          {editing ? t('edit') : t('add')}
        </SectionTitle>
        {!editing && templates.length > 0 ? (
          <TemplateChips
            items={templates.map(template => ({ id: template.id, name: template.name, meta: f.minutes(template.minutes) }))}
            disabled={busy}
            onPick={id => void quickAdd(templates.find(template => template.id === id)!)}
          />
        ) : null}
        <form ref={formRef} onSubmit={submit} className="space-y-3" noValidate>
          <Input
            id="ex-name"
            label={t('name')}
            value={name}
            onChange={event => {
              setName(event.target.value)
              setError('')
            }}
            placeholder={t('namePlaceholder')}
            autoComplete="off"
            enterKeyHint="next"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ex-mins" className={labelClasses}>
                {t('minutes')}
              </label>
              <input
                id="ex-mins"
                className={cn(fieldClasses, 'h-11 px-3.5 font-mono text-base tabular-nums sm:h-10 sm:text-sm')}
                inputMode="numeric"
                pattern="[0-9]*"
                value={mins}
                onChange={event => {
                  setMins(event.target.value)
                  setError('')
                }}
                placeholder="45"
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
            <div>
              <label htmlFor="ex-kcal" className={labelClasses}>
                {t('calories')} <span className="font-normal text-ink-faint">{t('burnedHint')}</span>
              </label>
              <input
                id="ex-kcal"
                className={cn(fieldClasses, 'h-11 px-3.5 font-mono text-base tabular-nums placeholder:font-sans sm:h-10 sm:text-sm')}
                inputMode="numeric"
                pattern="[0-9]*"
                value={kcal}
                onChange={event => {
                  setKcal(event.target.value)
                  setError('')
                }}
                placeholder={tCommon('optional')}
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
          </div>
          <Select
            id="ex-type"
            label={t('type')}
            value={type}
            onChange={event => setType(event.target.value)}
            options={EXERCISE_TYPES.map(option => ({ value: option, label: labels.exerciseType(option) }))}
          />
          <div>
            <label htmlFor="ex-notes" className={labelClasses}>
              {t('notes')} <span className="font-normal text-ink-faint">{tCommon('optionalHint')}</span>
            </label>
            <input
              id="ex-notes"
              className={cn(fieldClasses, 'h-11 px-3.5 text-base sm:h-10 sm:text-sm')}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder={t('notesPlaceholder')}
              autoComplete="off"
              enterKeyHint="done"
            />
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? tCommon('saving') : editing ? tCommon('saveChanges') : t('add')}
          </Button>
        </form>
      </section>
    </div>
  )
}

/** Saved meals or workouts, one tap each: a row that scrolls on a phone and wraps on a wider screen. */
function TemplateChips({ items, disabled, onPick }: { items: { id: number; name: string; meta: string }[]; disabled: boolean; onPick: (id: number) => void }) {
  return (
    <div className="scrollbar-hidden -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(item.id)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-2.5 text-[13px] whitespace-nowrap text-ink transition-colors hover:bg-muted disabled:opacity-50 dark:bg-card"
        >
          <Plus size={13} aria-hidden="true" className="text-ink-muted" />
          {item.name}
          <Num className="text-(--tone-ink)">{item.meta}</Num>
        </button>
      ))}
    </div>
  )
}

function EntryRow({
  title,
  subtitle,
  shown,
  active,
  onEdit,
  onDelete,
}: {
  title: string
  subtitle?: string
  shown: string
  active?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const tCommon = useTranslations('habits.common')
  return (
    <li className={cn('flex items-center gap-1 pr-1', active && 'bg-accent-soft')}>
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 text-left"
        aria-label={tCommon('editNamed', { name: title })}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{title}</span>
          {subtitle ? <span className="block truncate text-xs text-ink-muted tabular-nums">{subtitle}</span> : null}
        </span>
        <Num className="shrink-0 pl-2 text-sm text-(--tone-ink)">{shown}</Num>
      </button>
      <IconButton
        size="sm"
        label={tCommon('deleteNamed', { name: title })}
        icon={<Trash2 size={15} />}
        onClick={onDelete}
        className="text-ink-faint hover:bg-danger-soft hover:text-danger"
      />
    </li>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-[10px] border border-line bg-card px-4 py-3 text-[13px] text-ink-muted">{text}</p>
}
