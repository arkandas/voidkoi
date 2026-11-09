import { describe, expect, it } from 'vitest'

import { aggregate, hasAny, sliceRange } from './aggregate'

const range = aggregate({
  weights: [
    { date: '2026-10-21', weight: 80.1 },
    { date: '2026-10-19', weight: 80.4 },
  ],
  foods: [
    { id: 1, date: '2026-10-21', name: 'Oats', calories: 350, quantity: 1, mealType: 'breakfast' },
    { id: 2, date: '2026-10-21', name: 'Rice', calories: 200, quantity: 1.5, mealType: 'lunch' },
  ],
  workouts: [{ id: 3, date: '2026-10-20', name: 'Run', minutes: 35, caloriesBurned: 380, type: 'cardio', notes: null }],
})

describe('aggregate', () => {
  it('adds up each day: its weigh-in, calories by servings, minutes and sessions', () => {
    expect(range.days['2026-10-21']).toEqual({ weight: 80.1, kcal: 650, foodCount: 2, minutes: 0, burned: 0, sessions: 0 })
    expect(range.days['2026-10-20']).toEqual({ kcal: 0, foodCount: 0, minutes: 35, burned: 380, sessions: 1 })
  })

  it('sorts the weigh-ins oldest first', () => {
    expect(range.weights.map(w => w.key)).toEqual(['2026-10-19', '2026-10-21'])
  })

  it('cuts a shorter range out of a longer one', () => {
    const part = sliceRange(range, '2026-10-20', '2026-10-20')
    expect(Object.keys(part.days)).toEqual(['2026-10-20'])
    expect(part.weights).toEqual([])
    expect(part.workouts).toHaveLength(1)
    expect(part.foods).toEqual([])
  })

  it('knows a day with nothing logged', () => {
    expect(hasAny(range.days['2026-10-20'])).toBe(true)
    expect(hasAny(undefined)).toBe(false)
    expect(hasAny({ kcal: 0, foodCount: 0, minutes: 0, burned: 0, sessions: 0 })).toBe(false)
  })
})
