import { describe, expect, it } from 'vitest'

import type { DayAgg, DayMap } from './aggregate'
import type { Goal } from './api-types'
import { dayStreak, planStatus, weighInOnOrBefore } from './insights'

const agg = (over: Partial<DayAgg>): DayAgg => ({ kcal: 0, foodCount: 0, minutes: 0, burned: 0, sessions: 0, ...over })
const goal = (over: Partial<Goal>): Goal => ({
  targetWeight: 78,
  startWeight: 82,
  startDate: '2026-09-01',
  weeklyWorkouts: 4,
  weeklyRate: 0.5,
  ...over,
})

describe('dayStreak', () => {
  const days: DayMap = {
    '2026-09-20': agg({ weight: 80 }),
    '2026-09-21': agg({ sessions: 1 }),
    '2026-09-22': agg({ weight: 80 }),
    '2026-09-24': agg({ weight: 80 }),
    '2026-09-25': agg({ foodCount: 2, kcal: 900 }),
    '2026-09-27': agg({ weight: 79.8 }),
    '2026-09-28': agg({ weight: 79.6, sessions: 1 }),
    '2026-09-29': agg({ weight: 79.5 }),
  }

  it('counts weigh-ins and workouts, not food, and lets today stay unfinished', () => {
    expect(dayStreak(days, '2026-09-30', '2026-01-01', '2026-01-01')).toEqual({ current: 3, best: 3 })
    expect(dayStreak(days, '2026-09-29', '2026-01-01', '2026-01-01').current).toBe(3)
  })

  it('stops at a missed day', () => {
    expect(dayStreak(days, '2026-10-01', '2026-01-01', '2026-01-01').current).toBe(0)
  })

  it('keeps a current run as the best one even when it started before the best-run window', () => {
    expect(dayStreak(days, '2026-09-29', '2026-01-01', '2026-09-28')).toEqual({ current: 3, best: 3 })
  })

  it('counts only what the account tracks', () => {
    // Without training, the workout on the 21st no longer joins the 20th and the 22nd.
    expect(dayStreak(days, '2026-09-22', '2026-01-01', '2026-01-01', { weight: true, training: false })).toEqual({ current: 1, best: 1 })
    expect(dayStreak(days, '2026-09-22', '2026-01-01', '2026-01-01', { weight: true, training: true })).toEqual({ current: 3, best: 3 })
    expect(dayStreak(days, '2026-09-28', '2026-01-01', '2026-01-01', { weight: false, training: true })).toEqual({ current: 1, best: 1 })
  })
})

describe('weighInOnOrBefore', () => {
  it('takes the last weigh-in up to that day', () => {
    const weights = [
      { key: '2026-09-01', weight: 82 },
      { key: '2026-09-10', weight: 81 },
    ]
    expect(weighInOnOrBefore(weights, '2026-09-09')).toEqual({ key: '2026-09-01', weight: 82 })
    expect(weighInOnOrBefore(weights, '2026-08-31')).toBeNull()
  })
})

describe('planStatus', () => {
  const weights = [
    { key: '2026-09-01', weight: 82 },
    { key: '2026-09-15', weight: 81 },
    { key: '2026-09-29', weight: 80.5 },
  ]

  it('needs a target, a start day and a weigh-in', () => {
    expect(planStatus(null, weights, '2026-09-29')).toBeNull()
    expect(planStatus(goal({ targetWeight: null }), weights, '2026-09-29')).toBeNull()
    expect(planStatus(goal({ startDate: null }), weights, '2026-09-29')).toBeNull()
    expect(planStatus(goal({}), [], '2026-09-29')).toBeNull()
  })

  it('compares the planned change with the real one', () => {
    const plan = planStatus(goal({}), weights, '2026-09-29')!
    expect(plan.dir).toBe(-1)
    expect(plan.planned).toBeCloseTo(-2)
    expect(plan.actual).toBeCloseTo(-1.5)
    expect(plan.vsPlan).toBeCloseTo(-0.5)
    expect(plan.remaining).toBeCloseTo(2.5)
    expect(plan.progress).toBeCloseTo(0.375)
    expect(plan.planEnd).toBe('2026-10-27')
    expect(plan.reached).toBe(false)
  })

  it('never plans past the target', () => {
    expect(planStatus(goal({}), weights, '2027-06-01')!.planned).toBeCloseTo(-4)
  })

  it('has no planned line without a weekly rate', () => {
    const plan = planStatus(goal({ weeklyRate: null }), weights, '2026-09-29')!
    expect(plan.planned).toBeNull()
    expect(plan.vsPlan).toBeNull()
    expect(plan.planEnd).toBeNull()
  })

  it('starts from the first weigh-in on or after the start day when no start weight was saved', () => {
    const plan = planStatus(goal({ startWeight: null, startDate: '2026-09-05' }), weights, '2026-09-29')!
    expect(plan.startKey).toBe('2026-09-15')
    expect(plan.startWeight).toBe(81)
  })

  it('works for gaining weight too', () => {
    const plan = planStatus(goal({ targetWeight: 80, startWeight: 78 }), [{ key: '2026-09-29', weight: 80.2 }], '2026-09-29')!
    expect(plan.dir).toBe(1)
    expect(plan.reached).toBe(true)
    expect(plan.progress).toBe(1)
  })
})
