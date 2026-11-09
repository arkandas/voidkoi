/** Calendar days written as "2026-10-27", in local time. Kept free of React so it can be tested directly. */

export interface Month {
  year: number
  /** 0 for January, as Date counts them. */
  month: number
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "2026-10-27" for the day a moment falls on, in local time. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A real day written as "2026-10-27". */
export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(dayDate(value)) === value
}

/** The local midnight a day starts at. */
export function dayDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!)
}

export function addDays(day: string, days: number): string {
  const date = dayDate(day)
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** The same day some months on, or that month's last day when it is shorter: 31 January and a month is 28 February. */
export function addMonths(day: string, months: number): string {
  const date = dayDate(day)
  const last = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate()
  return dayKey(new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), last)))
}

/** Whole days from one day to another: 1 from today to tomorrow, -1 back. */
export function daysBetween(from: string, to: string): number {
  const a = dayDate(from)
  const b = dayDate(to)
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

export function monthOf(day: string): Month {
  const date = dayDate(day)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function addMonthsTo({ year, month }: Month, months: number): Month {
  const date = new Date(year, month + months, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

/**
 * The 42 days of six weeks that show a month, starting on `firstDay` (0 for
 * Sunday). The end of the month before and the start of the next fill the
 * gaps, so every month takes the same room.
 */
export function calendarDays({ year, month }: Month, firstDay: number): string[] {
  const offset = (new Date(year, month, 1).getDay() - firstDay + 7) % 7
  return Array.from({ length: 42 }, (_, index) => dayKey(new Date(year, month, 1 - offset + index)))
}

// For browsers without Intl.Locale week data. Everywhere else starts on Monday.
const SUNDAY_FIRST = new Set(['BR', 'CA', 'HK', 'IL', 'IN', 'JP', 'KR', 'MO', 'MX', 'PH', 'SA', 'TW', 'US', 'ZA'])
const SATURDAY_FIRST = new Set(['AE', 'AF', 'BH', 'DJ', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SD', 'SY'])

type WeekLocale = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }

/** The day a week starts on where someone lives, 0 for Sunday: Monday in Spain, Sunday in the United States. */
export function firstDayOfWeek(tag: string): number {
  try {
    const locale = new Intl.Locale(tag) as WeekLocale
    const info = locale.getWeekInfo?.() ?? locale.weekInfo
    if (info) return info.firstDay % 7
    const region = locale.maximize().region ?? ''
    return SUNDAY_FIRST.has(region) ? 0 : SATURDAY_FIRST.has(region) ? 6 : 1
  } catch {
    return 1
  }
}
