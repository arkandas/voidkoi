/**
 * What a request body asks Habits to save, as the columns it changes. Each
 * reader returns null when a field is invalid, or when a field a new row needs
 * is missing. With `partial`, only the fields the body has are read.
 */
import { isDayKey } from './dates'
import { RATE_RANGE, WEIGHT_RANGE } from './metrics'
import { integerIn, LIMITS, numberIn, optionalText, requiredText } from './validate'

type Body = Record<string, unknown>

const MAX_KCAL = 100_000
const MAX_MINUTES = 1440
const MAX_SERVINGS = 999

interface Field<T> {
  /** The value, or undefined when it isn't valid. */
  read(value: unknown): T | undefined
  /** What a new row gets when the body leaves it out. Without one, it is required. */
  fallback?: T
}

const orUndefined = <T,>(value: T | null): T | undefined => (value === null ? undefined : value)

const text = (max: number): Field<string> => ({ read: value => orUndefined(requiredText(value, max)) })
const note = (max: number): Field<string | null> => ({ read: value => optionalText(value, max), fallback: null })
const whole = (min: number, max: number, fallback?: number): Field<number> => ({
  read: value => orUndefined(integerIn(value, min, max)),
  ...(fallback === undefined ? {} : { fallback }),
})
const servings = (fallback: number): Field<number> => ({
  read: value => {
    const n = numberIn(value, 0.01, MAX_SERVINGS)
    return n === null ? undefined : Math.round(n * 100) / 100
  },
  fallback,
})
const kind = (fallback: string): Field<string> => ({ read: value => orUndefined(requiredText(value, LIMITS.type)), fallback })
const day: Field<Date> = { read: value => (isDayKey(value) ? dbDate(value) : undefined) }

/** The Date a `@db.Date` column takes for a day. */
export const dbDate = (key: string) => new Date(`${key}T00:00:00Z`)

function read<S extends Record<string, Field<unknown>>>(
  body: Body,
  spec: S,
  partial: boolean,
): { [K in keyof S]?: S[K] extends Field<infer T> ? T : never } | null {
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(spec)) {
    if (body[key] === undefined) {
      if (partial) continue
      if (!('fallback' in field)) return null
      out[key] = field.fallback
      continue
    }
    const value = field.read(body[key])
    if (value === undefined) return null
    out[key] = value
  }
  return out as { [K in keyof S]?: S[K] extends Field<infer T> ? T : never }
}

const FOOD = {
  name: text(LIMITS.name),
  calories: whole(1, MAX_KCAL),
  quantity: servings(1),
  mealType: kind('other'),
}

const WORKOUT = {
  name: text(LIMITS.name),
  minutes: whole(1, MAX_MINUTES),
  caloriesBurned: whole(0, MAX_KCAL, 0),
  type: kind('other'),
  notes: note(LIMITS.notes),
}

const MEAL_TEMPLATE = {
  name: text(LIMITS.name),
  calories: whole(1, MAX_KCAL),
  quantity: servings(1),
  mealType: kind('other'),
  description: note(LIMITS.notes),
}

const WORKOUT_TEMPLATE = {
  name: text(LIMITS.name),
  minutes: whole(1, MAX_MINUTES),
  calories: whole(0, MAX_KCAL, 0),
  type: kind('other'),
  notes: note(LIMITS.notes),
}

export function readFood(body: Body, partial = false) {
  const fields = read(body, FOOD, partial)
  const date = partial ? undefined : day.read(body.date)
  if (!fields || (!partial && !date)) return null
  return {
    ...(date ? { date } : {}),
    ...(fields.name !== undefined ? { food_item: fields.name } : {}),
    ...(fields.calories !== undefined ? { calories: fields.calories } : {}),
    ...(fields.quantity !== undefined ? { quantity: fields.quantity } : {}),
    ...(fields.mealType !== undefined ? { meal_type: fields.mealType } : {}),
  }
}

export function readWorkout(body: Body, partial = false) {
  const fields = read(body, WORKOUT, partial)
  const date = partial ? undefined : day.read(body.date)
  if (!fields || (!partial && !date)) return null
  return {
    ...(date ? { date } : {}),
    ...(fields.name !== undefined ? { exercise_name: fields.name } : {}),
    ...(fields.minutes !== undefined ? { duration_minutes: fields.minutes } : {}),
    ...(fields.caloriesBurned !== undefined ? { calories_burned: fields.caloriesBurned } : {}),
    ...(fields.type !== undefined ? { exercise_type: fields.type } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
  }
}

export function readMealTemplate(body: Body, partial = false) {
  const fields = read(body, MEAL_TEMPLATE, partial)
  if (!fields) return null
  return {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.calories !== undefined ? { calories: fields.calories } : {}),
    ...(fields.quantity !== undefined ? { default_quantity: fields.quantity } : {}),
    ...(fields.mealType !== undefined ? { meal_type: fields.mealType } : {}),
    ...(fields.description !== undefined ? { description: fields.description } : {}),
  }
}

export function readWorkoutTemplate(body: Body, partial = false) {
  const fields = read(body, WORKOUT_TEMPLATE, partial)
  if (!fields) return null
  return {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.minutes !== undefined ? { duration_minutes: fields.minutes } : {}),
    ...(fields.calories !== undefined ? { calories: fields.calories } : {}),
    ...(fields.type !== undefined ? { exercise_type: fields.type } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
  }
}

/** A weigh-in in kg, to two decimals. */
export function readWeight(body: Body): number | null {
  const weight = numberIn(body.weight, WEIGHT_RANGE[0], WEIGHT_RANGE[1])
  return weight === null ? null : Math.round(weight * 100) / 100
}

/** The goal's fields the body has: null clears one. Null as a whole when one is invalid. */
export function readGoal(body: Body) {
  const out: {
    target_weight?: number | null
    start_weight?: number | null
    start_date?: Date | null
    weekly_workouts?: number | null
    weekly_rate?: number | null
  } = {}
  const kg = (value: unknown) => numberIn(value, WEIGHT_RANGE[0], WEIGHT_RANGE[1])
  const fields = [
    ['targetWeight', 'target_weight', kg],
    ['startWeight', 'start_weight', kg],
    ['startDate', 'start_date', (value: unknown) => (isDayKey(value) ? dbDate(value) : null)],
    ['weeklyWorkouts', 'weekly_workouts', (value: unknown) => integerIn(value, 1, 14)],
    ['weeklyRate', 'weekly_rate', (value: unknown) => numberIn(value, RATE_RANGE[0], RATE_RANGE[1])],
  ] as const
  for (const [key, column, check] of fields) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null) {
      out[column] = null
      continue
    }
    const parsed = check(value)
    if (parsed === null) return null
    ;(out as Record<string, unknown>)[column] = parsed
  }
  return out
}
