/** How sizes, speeds and times read. Kept free of React so it can be tested directly. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * "2.4 MB" in English, "2,4 MB" in Spanish. Powers of 1024, one decimal while
 * the number is small enough for it to matter.
 */
export function formatBytes(bytes: number, locale: string): string {
  let value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // Rounding 1023.96 KB to one decimal would print "1024 KB"; step up instead.
  if (unit > 0 && unit < UNITS.length - 1 && Math.round(value * 10) / 10 >= 1024) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value)
  return `${number} ${UNITS[unit]}`
}

/** "1:05" or "1:02:05", for media lengths and call timers. Anything that isn't a positive number is 0:00. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

export function formatSpeed(bytesPerSecond: number, locale: string): string {
  return `${formatBytes(bytesPerSecond, locale)}/s`
}

export type TimeLeft =
  | { unit: 'few' }
  | { unit: 'seconds'; value: number }
  | { unit: 'minutes'; value: number }
  | { unit: 'hours'; hours: number; minutes: number }

/**
 * Time left, rounded so it reads calmly: a few seconds, then 5-second steps
 * under a minute, whole minutes under an hour. Null when there's no estimate.
 */
export function roundTimeLeft(seconds: number): TimeLeft | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  if (seconds < 10) return { unit: 'few' }
  if (seconds < 60) return { unit: 'seconds', value: Math.min(55, Math.ceil(seconds / 5) * 5) }
  if (seconds < 3600) return { unit: 'minutes', value: Math.ceil(seconds / 60) }
  const hours = Math.floor(seconds / 3600)
  return { unit: 'hours', hours, minutes: Math.ceil((seconds - hours * 3600) / 60) }
}

/** A time for today, the day and month this year, and the year too before that. */
export function formatDate(iso: string, locale: string, now = new Date()): string {
  const date = new Date(iso)
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** Whole days until `days` after `from`, never below zero. */
export function daysUntil(from: string, days: number, now = new Date()): number {
  const end = new Date(from).getTime() + days * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000)))
}

/** Bytes written as a number and a unit, for the admin's limit fields. */
export const SIZE_UNITS = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const
export type SizeUnit = keyof typeof SIZE_UNITS

export function splitBytes(bytes: number): { value: number; unit: SizeUnit } {
  for (const unit of ['TB', 'GB'] as const) {
    if (bytes >= SIZE_UNITS[unit] && bytes % (SIZE_UNITS[unit] / 1024) === 0) {
      return { value: Math.round((bytes / SIZE_UNITS[unit]) * 100) / 100, unit }
    }
  }
  return { value: Math.round((bytes / SIZE_UNITS.MB) * 100) / 100, unit: 'MB' }
}
