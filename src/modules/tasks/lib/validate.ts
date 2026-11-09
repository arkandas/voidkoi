import { PRIORITIES, STICKY_COLORS, type Priority, type StickyColor } from '@/modules/tasks/lib/api-types'

export const TASKS_LIMITS = {
  title: 200,
  description: 5000,
  stickyNote: 2000,
} as const

/** A board has at most this many sections. */
export const MAX_SECTIONS = 6

/** The trash keeps the most recently deleted sticky notes, up to this many. */
export const TRASH_LIMIT = 50

/** A place in a list: 0 or more. */
export function parseIndex(value: unknown): number | null {
  const index = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isInteger(index) && index >= 0 ? index : null
}

/** Undefined leaves a field alone, null or blank clears it, anything else is kept as written. */
export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string' || value.length > max) return undefined
  return value.trim() === '' ? null : value
}

export function isValidOptionalText(value: unknown, max: number): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= max)
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
}

export function isStickyColor(value: unknown): value is StickyColor {
  return typeof value === 'string' && (STICKY_COLORS as readonly string[]).includes(value)
}

/** A date, null to clear it, undefined to leave it alone, or 'invalid'. */
export function parseOptionalDate(value: unknown): Date | null | undefined | 'invalid' {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A copy with one item moved, the target kept inside the list. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!)
  return next
}
