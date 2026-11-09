/**
 * What Habits tracks. Each is a sub-app an account can leave out, so the keys
 * are the sub-app ids: "habits.weight", "habits.food", "habits.training".
 */
export const METRICS = ['weight', 'food', 'training'] as const

export type Metric = (typeof METRICS)[number]

export const isMetric = (value: unknown): value is Metric => typeof value === 'string' && (METRICS as readonly string[]).includes(value)

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const EXERCISE_TYPES = ['cardio', 'strength', 'flexibility', 'sports', 'other'] as const

/** The meal a food logged now most likely belongs to. */
export const mealForHour = (hour: number): MealType =>
  hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 18 ? 'snack' : hour < 23 ? 'dinner' : 'snack'

/** The calories a food entry or meal template counts for: per serving times servings. */
export const entryKcal = (entry: { calories: number; quantity: number }) => Math.round(entry.calories * entry.quantity)

/** The weights Habits accepts, in kg: for a weigh-in and the goal. */
export const WEIGHT_RANGE = [20, 500] as const

/** The weekly rates a plan can have, in kg a week. */
export const RATE_RANGE = [0.05, 2] as const
