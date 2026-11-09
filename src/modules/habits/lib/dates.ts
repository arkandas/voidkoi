/**
 * Days and months as Habits counts them. Days are the suite's "2026-10-27"
 * keys (`@/lib/days`); weeks start on Monday. Kept free of React so it can be
 * tested directly.
 */
import { addDays, dayDate, dayKey, isDay } from '@/lib/days'

export type DayKey = string

const pad = (value: number) => String(value).padStart(2, '0')

/** A day from the address bar or a request: null and other text are not days. */
export const isDayKey = (value: unknown): value is DayKey => typeof value === 'string' && isDay(value)

/** "2026-10" for the month a moment falls in. */
export const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

export const isMonthKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/** Monday to Sunday of the week a day falls in. */
export function weekKeys(day: DayKey): DayKey[] {
  const monday = addDays(day, -((dayDate(day).getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

/** The first day of a month and of the six-week grid that shows it: Mondays to Sundays, whole weeks. */
export function monthGrid(month: Date): DayKey[] {
  const first = dayKey(new Date(month.getFullYear(), month.getMonth(), 1))
  const last = dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const start = weekKeys(first)[0]!
  const end = weekKeys(last)[6]!
  const days: DayKey[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
}

/** The weeks of history the overview, the templates and the weigh-in form look back over. */
export const historyRange = (today: DayKey) => ({ start: addDays(today, -430), end: addDays(today, 42) })
