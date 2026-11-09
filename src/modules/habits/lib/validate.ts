/** Checks on what a request sends Habits. Kept free of the server so it can be tested directly. */

export { requiredText } from '@/lib/validate'

export const LIMITS = {
  /** Food, workout and template names. */
  name: 255,
  /** Workout notes and meal descriptions. */
  notes: 2000,
  /** A meal or workout type. */
  type: 50,
} as const

/** A finite number from JSON within [min, max]; null otherwise. */
export function numberIn(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

/** A whole number from JSON within [min, max]; null otherwise. */
export function integerIn(value: unknown, min: number, max: number): number | null {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null
}

/**
 * Text that may be left out or cleared: undefined when it isn't valid, null
 * when it was cleared (null or blank), the text otherwise.
 */
export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > max) return undefined
  return value.trim() === '' ? null : value.trim()
}
