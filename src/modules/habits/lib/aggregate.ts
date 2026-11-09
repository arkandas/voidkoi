/** What was logged, added up per day. Kept free of React so it can be tested directly. */
import type { FoodEntry, RangeDto, Workout } from './api-types'
import type { DayKey } from './dates'
import { entryKcal } from './metrics'

export interface DayAgg {
  weight?: number
  kcal: number
  foodCount: number
  minutes: number
  burned: number
  sessions: number
}

export type DayMap = Record<DayKey, DayAgg>

export interface RangeData {
  days: DayMap
  /** Oldest first. */
  weights: { key: DayKey; weight: number }[]
  workouts: Workout[]
  foods: FoodEntry[]
}

const emptyDay = (): DayAgg => ({ kcal: 0, foodCount: 0, minutes: 0, burned: 0, sessions: 0 })

export function aggregate(range: RangeDto): RangeData {
  const days: DayMap = {}
  const day = (key: DayKey) => (days[key] ??= emptyDay())
  for (const w of range.weights) day(w.date).weight = w.weight
  for (const food of range.foods) {
    const d = day(food.date)
    d.kcal += entryKcal(food)
    d.foodCount++
  }
  for (const workout of range.workouts) {
    const d = day(workout.date)
    d.minutes += workout.minutes
    d.burned += workout.caloriesBurned
    d.sessions++
  }
  return {
    days,
    weights: range.weights.map(w => ({ key: w.date, weight: w.weight })).sort((a, b) => a.key.localeCompare(b.key)),
    workouts: range.workouts,
    foods: range.foods,
  }
}

/** The part of a range between two days. */
export function sliceRange(data: RangeData, start: DayKey, end: DayKey): RangeData {
  const days: DayMap = {}
  for (const key in data.days) if (key >= start && key <= end) days[key] = data.days[key]!
  const inside = (key: DayKey) => key >= start && key <= end
  return {
    days,
    weights: data.weights.filter(w => inside(w.key)),
    workouts: data.workouts.filter(w => inside(w.date)),
    foods: data.foods.filter(f => inside(f.date)),
  }
}

export const hasAny = (day?: DayAgg) => !!day && (day.weight != null || day.foodCount > 0 || day.sessions > 0)
