/** The JSON Habits' routes speak. Days are "2026-10-27"; weights are in kg. */

export interface WeighIn {
  date: string
  weight: number
}

export interface FoodEntry {
  id: number
  date: string
  name: string
  /** Per serving. */
  calories: number
  /** Servings. */
  quantity: number
  mealType: string
}

export interface Workout {
  id: number
  date: string
  name: string
  minutes: number
  caloriesBurned: number
  type: string
  notes: string | null
}

export interface MealTemplate {
  id: number
  name: string
  /** Per serving. */
  calories: number
  /** The servings it logs. */
  quantity: number
  mealType: string
  description: string | null
}

export interface WorkoutTemplate {
  id: number
  name: string
  minutes: number
  calories: number
  type: string
  notes: string | null
}

export interface Goal {
  targetWeight: number | null
  /** The weight the plan is counted from, kept so a later weigh-in on that day doesn't move it. */
  startWeight: number | null
  startDate: string | null
  weeklyWorkouts: number | null
  /** Kilos lost or gained per week. */
  weeklyRate: number | null
}

/** Everything logged from one day to another, for what the account tracks. */
export interface RangeDto {
  weights: WeighIn[]
  foods: FoodEntry[]
  workouts: Workout[]
}

/** One day, for what the account tracks, with the weigh-in before it. */
export interface DayDto {
  date: string
  weight: number | null
  previous: WeighIn | null
  foods: FoodEntry[]
  workouts: Workout[]
}

export type FoodInput = Pick<FoodEntry, 'date' | 'name' | 'calories' | 'quantity' | 'mealType'>
export type WorkoutInput = Pick<Workout, 'date' | 'name' | 'minutes' | 'caloriesBurned' | 'type'> & { notes?: string | null }
export type MealTemplateInput = Omit<MealTemplate, 'id'>
export type WorkoutTemplateInput = Omit<WorkoutTemplate, 'id'>
