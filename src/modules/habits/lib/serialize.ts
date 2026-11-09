/** Habits' rows as its routes send them. */
import type { CalorieEntry, ExerciseEntry, ExerciseTemplate, Goal, MealTemplate, WeightEntry } from '@/generated/prisma/client'

import type {
  FoodEntry,
  Goal as GoalDto,
  MealTemplate as MealTemplateDto,
  WeighIn,
  Workout,
  WorkoutTemplate as WorkoutTemplateDto,
} from './api-types'

/** The day a `@db.Date` column holds, "2026-10-27". */
export const dayOf = (date: Date) => date.toISOString().slice(0, 10)

const num = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()))

export const weighInDto = (row: WeightEntry): WeighIn => ({ date: dayOf(row.date), weight: Number(row.weight.toString()) })

export const foodDto = (row: CalorieEntry): FoodEntry => ({
  id: row.id,
  date: dayOf(row.date),
  name: row.food_item,
  calories: row.calories,
  quantity: Number(row.quantity.toString()),
  mealType: row.meal_type,
})

export const workoutDto = (row: ExerciseEntry): Workout => ({
  id: row.id,
  date: dayOf(row.date),
  name: row.exercise_name,
  minutes: row.duration_minutes,
  caloriesBurned: row.calories_burned,
  type: row.exercise_type,
  notes: row.notes,
})

export const mealTemplateDto = (row: MealTemplate): MealTemplateDto => ({
  id: row.id,
  name: row.name,
  calories: row.calories,
  quantity: Number(row.default_quantity.toString()),
  mealType: row.meal_type,
  description: row.description,
})

export const workoutTemplateDto = (row: ExerciseTemplate): WorkoutTemplateDto => ({
  id: row.id,
  name: row.name,
  minutes: row.duration_minutes,
  calories: row.calories,
  type: row.exercise_type,
  notes: row.notes,
})

export const NO_GOAL: GoalDto = { targetWeight: null, startWeight: null, startDate: null, weeklyWorkouts: null, weeklyRate: null }

export const goalDto = (row: Goal | null): GoalDto =>
  row
    ? {
        targetWeight: num(row.target_weight),
        startWeight: num(row.start_weight),
        startDate: row.start_date ? dayOf(row.start_date) : null,
        weeklyWorkouts: row.weekly_workouts,
        weeklyRate: num(row.weekly_rate),
      }
    : NO_GOAL
