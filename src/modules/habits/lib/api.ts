/** Habits' calls to its own routes, under `/api/habits`. */
import { request } from '@/lib/api'

import type {
  DayDto,
  FoodEntry,
  FoodInput,
  Goal,
  MealTemplate,
  MealTemplateInput,
  RangeDto,
  WeighIn,
  Workout,
  WorkoutInput,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from './api-types'

export const api = {
  range: (from: string, to: string) => request<RangeDto>('GET', `/habits/days?from=${from}&to=${to}`, undefined, 'loadFailed'),
  day: (date: string) => request<DayDto>('GET', `/habits/days/${date}`, undefined, 'loadFailed'),

  /** Saves the weigh-in of a day, replacing the one it had. */
  saveWeight: (date: string, weight: number) => request<WeighIn>('PUT', `/habits/weights/${date}`, { weight }, 'saveFailed'),
  deleteWeight: (date: string) => request<unknown>('DELETE', `/habits/weights/${date}`, undefined, 'deleteFailed'),

  addFood: (food: FoodInput) => request<FoodEntry>('POST', '/habits/foods', food, 'saveFailed'),
  updateFood: (id: number, changes: Partial<Omit<FoodInput, 'date'>>) => request<FoodEntry>('PATCH', `/habits/foods/${id}`, changes, 'saveFailed'),
  deleteFood: (id: number) => request<unknown>('DELETE', `/habits/foods/${id}`, undefined, 'deleteFailed'),

  addWorkout: (workout: WorkoutInput) => request<Workout>('POST', '/habits/workouts', workout, 'saveFailed'),
  updateWorkout: (id: number, changes: Partial<Omit<WorkoutInput, 'date'>>) =>
    request<Workout>('PATCH', `/habits/workouts/${id}`, changes, 'saveFailed'),
  deleteWorkout: (id: number) => request<unknown>('DELETE', `/habits/workouts/${id}`, undefined, 'deleteFailed'),

  mealTemplates: () => request<MealTemplate[]>('GET', '/habits/meal-templates', undefined, 'loadFailed'),
  addMealTemplate: (template: MealTemplateInput) => request<MealTemplate>('POST', '/habits/meal-templates', template, 'saveFailed'),
  updateMealTemplate: (id: number, changes: Partial<MealTemplateInput>) =>
    request<MealTemplate>('PATCH', `/habits/meal-templates/${id}`, changes, 'saveFailed'),
  deleteMealTemplate: (id: number) => request<unknown>('DELETE', `/habits/meal-templates/${id}`, undefined, 'deleteFailed'),

  workoutTemplates: () => request<WorkoutTemplate[]>('GET', '/habits/workout-templates', undefined, 'loadFailed'),
  addWorkoutTemplate: (template: WorkoutTemplateInput) => request<WorkoutTemplate>('POST', '/habits/workout-templates', template, 'saveFailed'),
  updateWorkoutTemplate: (id: number, changes: Partial<WorkoutTemplateInput>) =>
    request<WorkoutTemplate>('PATCH', `/habits/workout-templates/${id}`, changes, 'saveFailed'),
  deleteWorkoutTemplate: (id: number) => request<unknown>('DELETE', `/habits/workout-templates/${id}`, undefined, 'deleteFailed'),

  goal: () => request<Goal>('GET', '/habits/goal', undefined, 'loadFailed'),
  /** Only the fields given change; null clears one. */
  saveGoal: (changes: Partial<Goal>) => request<Goal>('PUT', '/habits/goal', changes, 'saveFailed'),
}
