'use client'

import { useTranslations } from 'next-intl'
import { useState, type FormEvent, type ReactNode } from 'react'

import { Button, DatePicker, Modal, fieldClasses, labelClasses, useToast } from '@/components/ui'
import { cn } from '@/lib/cn'
import { addDays, addMonths } from '@/lib/days'
import { useApiError } from '@/lib/use-api-error'
import { api } from '@/modules/habits/lib/api'
import type { Goal } from '@/modules/habits/lib/api-types'
import { bumpData } from '@/modules/habits/lib/data'
import { isDayKey, type DayKey } from '@/modules/habits/lib/dates'
import { parseDecimal } from '@/modules/habits/lib/format'
import { RATE_RANGE, WEIGHT_RANGE } from '@/modules/habits/lib/metrics'
import { useFormat } from '@/modules/habits/lib/use-format'
import { useTracks } from '@/modules/habits/lib/use-tracks'

import { FormError, Num } from './bits'
import { WeightStepper } from './day-panel'

type Point = { key: DayKey; weight: number }

const RATES = [0.25, 0.5, 0.75, 1]
const WORKOUTS = [1, 2, 3, 4, 5, 6, 7]

const weightOn = (weights: Point[], day: DayKey) =>
  weights.filter(w => w.key <= day).at(-1)?.weight ?? weights.find(w => w.key > day)?.weight ?? null

/** The weight goal, its weekly pace and start, and the workouts a week: the parts the account tracks. */
export function GoalDialog({ open, onClose, goal, weights, today }: { open: boolean; onClose: () => void; goal: Goal | null; weights: Point[]; today: DayKey }) {
  const t = useTranslations('habits.goal')
  return (
    <Modal open={open} onClose={onClose} label={t('title')} title={t('title')}>
      {open ? <GoalForm goal={goal} weights={weights} today={today} onClose={onClose} /> : null}
    </Modal>
  )
}

/** One of a few values, pressed or not. */
function Choice({ pressed, onClick, className, children }: { pressed: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg border px-3 text-[13px] transition-colors sm:h-9',
        'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
        pressed ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line-strong bg-raised text-ink-muted hover:bg-muted hover:text-ink dark:bg-card',
        className,
      )}
    >
      {children}
    </button>
  )
}

function GoalForm({ goal, weights, today, onClose }: { goal: Goal | null; weights: Point[]; today: DayKey; onClose: () => void }) {
  const t = useTranslations('habits.goal')
  const tCommon = useTranslations('habits.common')
  const tShared = useTranslations('common')
  const tToasts = useTranslations('habits.toasts')
  const tValidation = useTranslations('habits.validation')
  const f = useFormat()
  const apiError = useApiError()
  const toast = useToast()
  const tracks = useTracks()
  const latest = weights.at(-1)?.weight ?? null
  const target0 = goal?.targetWeight ?? null
  const start0 = goal?.startDate ?? null
  const [target, setTarget] = useState(target0 != null ? f.kg(target0) : latest != null ? f.kg(Math.round((latest - 3) * 2) / 2) : '')
  const [rate, setRate] = useState(goal?.weeklyRate != null ? f.num(goal.weeklyRate) : '')
  const [startDay, setStartDay] = useState<DayKey>(start0 ?? today)
  const [weekly, setWeekly] = useState<number>(goal?.weeklyWorkouts ?? 4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const kg = parseDecimal(target)
  const r = rate.trim() ? parseDecimal(rate) : null
  const startWeight = startDay === start0 && goal?.startWeight != null ? goal.startWeight : (weightOn(weights, startDay) ?? latest)
  const total = Number.isFinite(kg) && startWeight != null ? Math.abs(startWeight - kg) : null
  const planEnd = total != null && r && r > 0 ? addDays(startDay, Math.ceil((total / r) * 7)) : null
  const losing = Number.isFinite(kg) && startWeight != null ? kg < startWeight : true
  const strong = (chunks: ReactNode) => <Num className="text-ink">{chunks}</Num>

  const step = (by: number) => {
    setTarget(f.kg(Math.max(WEIGHT_RANGE[0], Math.round(((Number.isFinite(kg) ? kg : (latest ?? 75)) + by) * 2) / 2)))
    setError('')
  }

  const save = async (event: FormEvent | null, clear = false) => {
    event?.preventDefault()
    if (tracks.weight && !clear) {
      if (!(kg >= WEIGHT_RANGE[0] && kg <= WEIGHT_RANGE[1])) return setError(tValidation('targetWeight'))
      if (r != null && !(r >= RATE_RANGE[0] && r <= RATE_RANGE[1]))
        return setError(tValidation('weeklyRate', { min: f.num(RATE_RANGE[0]), max: f.num(RATE_RANGE[1]) }))
      if (!isDayKey(startDay) || startDay > today) return setError(tValidation('futureStart'))
    }
    setBusy(true)
    try {
      const changes: Partial<Goal> = tracks.training ? { weeklyWorkouts: weekly } : {}
      if (tracks.weight) {
        const newTarget = clear ? null : Math.round(kg * 10) / 10
        // A new target or start day starts the plan again from that day's weight.
        const restart = !clear && (newTarget !== target0 || startDay !== start0)
        Object.assign(changes, {
          targetWeight: newTarget,
          weeklyRate: clear ? null : r,
          ...(restart ? { startWeight, startDate: startDay } : {}),
          ...(clear ? { startWeight: null, startDate: null } : {}),
        })
      }
      await api.saveGoal(changes)
      toast.show(clear ? tToasts('goalRemoved') : tToasts('goalSaved'), 'success')
      bumpData()
      onClose()
    } catch (caught) {
      setError(apiError(caught, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {tracks.weight ? (
        <>
          <div>
            <label htmlFor="goal-weight" className={labelClasses}>
              {t('target')}
            </label>
            <WeightStepper
              id="goal-weight"
              value={target}
              onChange={next => {
                setTarget(next)
                setError('')
              }}
              onStep={step}
              step={0.5}
              placeholder={f.kg(75)}
            />
            {latest != null && Number.isFinite(kg) ? (
              <p className="mt-2 text-[13px] text-ink-muted">
                {t.rich('now', { kg: f.kg(latest), diff: f.kg(Math.abs(latest - kg)), direction: kg < latest ? 'lose' : 'gain', v: strong })}
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className={labelClasses}>
              {t('weekly')} <span className="font-normal text-ink-faint">{t('weeklyUnit', { direction: losing ? 'lose' : 'gain' })}</span>
            </legend>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {RATES.map(option => (
                <Choice
                  key={option}
                  pressed={r === option}
                  onClick={() => {
                    setRate(f.num(option))
                    setError('')
                  }}
                  className="px-0 font-mono tabular-nums"
                >
                  {f.num(option)}
                </Choice>
              ))}
              <input
                aria-label={t('customRate')}
                className={cn(fieldClasses, 'h-10 min-w-0 px-2 text-center font-mono text-[13px] tabular-nums placeholder:font-sans sm:h-9')}
                inputMode="decimal"
                placeholder={t('other')}
                value={RATES.includes(r ?? -1) ? '' : rate}
                onChange={event => {
                  setRate(event.target.value)
                  setError('')
                }}
              />
              <Choice pressed={r == null} onClick={() => setRate('')} className="px-0">
                {t('none')}
              </Choice>
            </div>
            {planEnd ? (
              <p className="mt-2 text-[13px] text-ink-muted">
                {t.rich('reach', { kg: f.kg(kg), date: f.date(planEnd, 'monthDayYear'), v: strong, d: chunks => <span className="text-ink">{chunks}</span> })}
              </p>
            ) : null}
          </fieldset>

          <div>
            <p className={labelClasses}>{t('starts')}</p>
            <DatePicker
              label={t('starts')}
              value={startDay}
              max={today}
              onChange={next => {
                setStartDay(next)
                setError('')
              }}
              presets={[
                { label: tCommon('today'), value: today },
                { label: t('weekAgo'), value: addDays(today, -7) },
                { label: t('monthAgo'), value: addMonths(today, -1) },
              ]}
            />
            {startWeight != null ? <p className="mt-2 text-[13px] text-ink-muted">{t.rich('startWeight', { kg: f.kg(startWeight), v: strong })}</p> : null}
          </div>
        </>
      ) : null}

      {tracks.training ? (
        <fieldset>
          <legend className={labelClasses}>{t('workouts')}</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {WORKOUTS.map(n => (
              <Choice key={n} pressed={n === weekly} onClick={() => setWeekly(n)} className="px-0 font-mono text-[15px] tabular-nums">
                {n}
              </Choice>
            ))}
          </div>
        </fieldset>
      ) : null}

      <FormError>{error}</FormError>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center">
        {tracks.weight && target0 != null ? (
          <Button variant="ghost" disabled={busy} onClick={() => void save(null, true)} className="text-danger hover:bg-danger-soft sm:-ml-2">
            {t('remove')}
          </Button>
        ) : null}
        <span className="hidden flex-1 sm:block" />
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {tShared('cancel')}
        </Button>
        <Button type="submit" disabled={busy} className="sm:min-w-24">
          {busy ? tCommon('saving') : tShared('save')}
        </Button>
      </div>
    </form>
  )
}
