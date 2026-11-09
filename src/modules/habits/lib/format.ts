/** How Habits writes numbers, durations and days in each language. Kept free of React so it can be tested directly. */
import { dayDate, daysBetween } from '@/lib/days'

import type { DayKey } from './dates'

/** A decimal typed with a point or a comma: "79.6", "79,6". NaN when it isn't one. */
export const parseDecimal = (text: string): number => {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) ? value : NaN
}

/** A whole number of zero or more, typed: "350". NaN for anything else. */
export const parseIntStrict = (text: string): number => {
  const trimmed = text.trim()
  return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN
}

const DATE_STYLES = {
  monthDay: { month: 'short', day: 'numeric' },
  monthDayYear: { month: 'short', day: 'numeric', year: 'numeric' },
  longDate: { weekday: 'long', month: 'long', day: 'numeric' },
  mediumDate: { weekday: 'long', month: 'short', day: 'numeric' },
  shortDate: { weekday: 'short', month: 'short', day: 'numeric' },
  weekdayShort: { weekday: 'short' },
  weekdayNarrow: { weekday: 'narrow' },
  monthShort: { month: 'short' },
  monthLong: { month: 'long' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

export type DateStyle = keyof typeof DATE_STYLES

/** The words a language uses for durations and nearby days, from its messages. */
export interface FormatWords {
  minutes: (m: number) => string
  hours: (h: number) => string
  hoursMinutes: (h: number, m: number) => string
  today: string
  yesterday: string
  tomorrow: string
  daysAgo: (n: number) => string
  inDays: (n: number) => string
}

export function createFormat(locale: string, words: FormatWords) {
  const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const one = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const upToTwo = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  const dateFormats = new Map<DateStyle, Intl.DateTimeFormat>()
  const order = new Intl.DateTimeFormat(locale, DATE_STYLES.monthDay).formatToParts(new Date(2024, 0, 15)).map(part => part.type)

  // A true minus, and no sign at all for what rounds to zero.
  const signed = (formatter: Intl.NumberFormat, value: number, step: number) => {
    const rounded = Math.round(value / step) * step
    if (rounded === 0) return formatter.format(0)
    return (rounded > 0 ? '+' : '−') + formatter.format(Math.abs(rounded))
  }

  const date = (day: DayKey | Date, style: DateStyle) => {
    let formatter = dateFormats.get(style)
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, DATE_STYLES[style])
      dateFormats.set(style, formatter)
    }
    return formatter.format(typeof day === 'string' ? dayDate(day) : day)
  }

  return {
    locale,
    /** "Sep 30" rather than "30 sept". */
    monthFirst: order.indexOf('month') < order.indexOf('day'),
    int: (n: number) => int.format(Math.round(n)),
    num: (n: number) => num.format(n),
    kg: (n: number) => one.format(n),
    delta: (n: number) => signed(one, n, 0.1),
    rate: (n: number) => signed(upToTwo, n, 0.01),
    minutes: (mins: number) => words.minutes(mins),
    duration: (mins: number) => {
      if (mins < 60) return words.minutes(mins)
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return m ? words.hoursMinutes(h, m) : words.hours(h)
    },
    date,
    /** The first letter up, as at the start of a line: "Miércoles, 30 de septiembre". */
    title: (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1),
    relative: (day: DayKey, today: DayKey) => {
      const diff = daysBetween(day, today)
      if (diff === 0) return words.today
      if (diff === 1) return words.yesterday
      if (diff === -1) return words.tomorrow
      if (diff > 1 && diff <= 31) return words.daysAgo(diff)
      if (diff < -1 && diff >= -31) return words.inDays(-diff)
      return date(day, day.slice(0, 4) === today.slice(0, 4) ? 'monthDay' : 'monthDayYear')
    },
  }
}

export type Format = ReturnType<typeof createFormat>
