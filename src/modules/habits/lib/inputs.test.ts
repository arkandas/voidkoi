import { describe, expect, it } from 'vitest'

import { dbDate, readFood, readGoal, readMealTemplate, readWeight, readWorkout, readWorkoutTemplate } from './inputs'

describe('food', () => {
  it('fills in a serving and the meal when they are left out', () => {
    expect(readFood({ date: '2026-10-22', name: ' Greek yogurt ', calories: 150 })).toEqual({
      date: dbDate('2026-10-22'),
      food_item: 'Greek yogurt',
      calories: 150,
      quantity: 1,
      meal_type: 'other',
    })
  })

  it('needs a day, a name and whole calories above zero', () => {
    expect(readFood({ name: 'Oats', calories: 350 })).toBeNull()
    expect(readFood({ date: '2026-02-30', name: 'Oats', calories: 350 })).toBeNull()
    expect(readFood({ date: '2026-10-22', name: '  ', calories: 350 })).toBeNull()
    expect(readFood({ date: '2026-10-22', name: 'Oats', calories: 0 })).toBeNull()
    expect(readFood({ date: '2026-10-22', name: 'Oats', calories: 350.5 })).toBeNull()
    expect(readFood({ date: '2026-10-22', name: 'Oats', calories: 350, quantity: 0 })).toBeNull()
  })

  it('keeps servings to two decimals', () => {
    expect(readFood({ date: '2026-10-22', name: 'Rice', calories: 200, quantity: 1.333 })?.quantity).toBe(1.33)
  })

  it('changes only what an edit sends, and not the day', () => {
    expect(readFood({ calories: 400 }, true)).toEqual({ calories: 400 })
    expect(readFood({ date: '2026-10-21', mealType: 'lunch' }, true)).toEqual({ meal_type: 'lunch' })
    expect(readFood({ name: '' }, true)).toBeNull()
  })
})

describe('workouts', () => {
  it('fills in burned calories, the type and notes when they are left out', () => {
    expect(readWorkout({ date: '2026-10-22', name: 'Yoga', minutes: 30 })).toEqual({
      date: dbDate('2026-10-22'),
      exercise_name: 'Yoga',
      duration_minutes: 30,
      calories_burned: 0,
      exercise_type: 'other',
      notes: null,
    })
  })

  it('keeps durations within a day', () => {
    expect(readWorkout({ date: '2026-10-22', name: 'Hike', minutes: 1441 })).toBeNull()
    expect(readWorkout({ date: '2026-10-22', name: 'Hike', minutes: 0 })).toBeNull()
  })

  it('clears notes with null or blank text', () => {
    expect(readWorkout({ notes: '' }, true)).toEqual({ notes: null })
    expect(readWorkout({ notes: null }, true)).toEqual({ notes: null })
    expect(readWorkout({ notes: 'x'.repeat(2001) }, true)).toBeNull()
  })
})

describe('templates', () => {
  it('reads a meal with its servings and description', () => {
    expect(readMealTemplate({ name: 'Oats', calories: 350, quantity: 1.5, mealType: 'breakfast', description: ' Oats, milk ' })).toEqual({
      name: 'Oats',
      calories: 350,
      default_quantity: 1.5,
      meal_type: 'breakfast',
      description: 'Oats, milk',
    })
    expect(readMealTemplate({ name: 'Oats' })).toBeNull()
  })

  it('reads a workout with burned calories that may be zero', () => {
    expect(readWorkoutTemplate({ name: 'Walk', minutes: 20, calories: 0 })).toEqual({
      name: 'Walk',
      duration_minutes: 20,
      calories: 0,
      exercise_type: 'other',
      notes: null,
    })
    expect(readWorkoutTemplate({ name: 'Walk', minutes: 20, calories: -1 })).toBeNull()
  })
})

describe('weigh-ins and the goal', () => {
  it('accepts weights from 20 to 500 kg, to two decimals', () => {
    expect(readWeight({ weight: 79.456 })).toBe(79.46)
    expect(readWeight({ weight: 19.9 })).toBeNull()
    expect(readWeight({ weight: '80' })).toBeNull()
  })

  it('changes only the goal fields sent, and clears those sent as null', () => {
    expect(readGoal({ weeklyWorkouts: 3 })).toEqual({ weekly_workouts: 3 })
    expect(readGoal({ targetWeight: null, startWeight: null, startDate: null, weeklyRate: null })).toEqual({
      target_weight: null,
      start_weight: null,
      start_date: null,
      weekly_rate: null,
    })
    expect(readGoal({ targetWeight: 77.5, startDate: '2026-07-01', weeklyRate: 0.25 })).toEqual({
      target_weight: 77.5,
      start_date: dbDate('2026-07-01'),
      weekly_rate: 0.25,
    })
  })

  it('refuses a goal field out of range', () => {
    expect(readGoal({ weeklyRate: 3 })).toBeNull()
    expect(readGoal({ weeklyWorkouts: 0 })).toBeNull()
    expect(readGoal({ targetWeight: 10 })).toBeNull()
    expect(readGoal({ startDate: 'yesterday' })).toBeNull()
  })
})
