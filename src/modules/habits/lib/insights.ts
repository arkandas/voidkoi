/** What the overview works out from what was logged: streaks and the plan. Kept free of React so it can be tested directly. */
import { addDays, daysBetween } from '@/lib/days'

import type { Goal } from './api-types'
import type { DayAgg, DayMap } from './aggregate'
import type { DayKey } from './dates'

/** Which logs keep a day in a streak: a weigh-in or a workout, as the account tracks them. */
export interface StreakCounts {
  weight: boolean
  training: boolean
}

const counter = (counts: StreakCounts) => (day?: DayAgg) =>
  !!day && ((counts.weight && day.weight != null) || (counts.training && day.sessions > 0))

function runEndingToday(done: (day: DayKey) => boolean, today: DayKey, first: DayKey) {
  let n = 0
  // Today still has time: a streak that ran until yesterday is still on.
  let day = done(today) ? today : addDays(today, -1)
  while (day >= first && done(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

/** Days in a row with a weigh-in or a workout up to today, and the longest run since `bestFrom`. */
export function dayStreak(days: DayMap, today: DayKey, first: DayKey, bestFrom: DayKey, counts: StreakCounts = { weight: true, training: true }) {
  const counted = counter(counts)
  const current = runEndingToday(day => counted(days[day]), today, first)
  let best = 0
  let run = 0
  for (let day = bestFrom; day <= today; day = addDays(day, 1)) {
    run = counted(days[day]) ? run + 1 : 0
    if (run > best) best = run
  }
  return { current, best: Math.max(best, current) }
}

type WeighInPoint = { key: DayKey; weight: number }

export const weighInOnOrBefore = (weights: WeighInPoint[], day: DayKey): WeighInPoint | null =>
  weights.filter(w => w.key <= day).at(-1) ?? null

export interface PlanStatus {
  target: number
  startKey: DayKey
  startWeight: number
  current: WeighInPoint
  /** -1 to lose weight, 1 to gain it. */
  dir: -1 | 1
  rate: number | null
  /** The change the weekly rate plans for by today, signed. */
  planned: number | null
  /** The change since the start, signed. */
  actual: number
  /** Kilos ahead of the plan (positive) or behind it (negative). */
  vsPlan: number | null
  planEnd: DayKey | null
  remaining: number
  progress: number
  reached: boolean
}

/** How the goal is going: needs a target, a start day and a weigh-in. */
export function planStatus(
  goal: Pick<Goal, 'targetWeight' | 'startWeight' | 'startDate' | 'weeklyRate'> | null,
  weights: WeighInPoint[],
  today: DayKey,
): PlanStatus | null {
  const current = weighInOnOrBefore(weights, today)
  if (goal?.targetWeight == null || !goal.startDate || !current) return null
  const target = goal.targetWeight
  let startKey = goal.startDate
  let startWeight: number
  if (goal.startWeight != null) startWeight = goal.startWeight
  else {
    const first = weights.find(w => w.key >= startKey) ?? current
    startKey = first.key
    startWeight = first.weight
  }
  const dir = target < startWeight ? -1 : 1
  const total = Math.abs(target - startWeight)
  const rate = goal.weeklyRate
  const weeks = Math.max(0, daysBetween(startKey, today)) / 7
  const planned = rate ? dir * Math.min(total, rate * weeks) : null
  const actual = current.weight - startWeight
  return {
    target,
    startKey,
    startWeight,
    current,
    dir,
    rate,
    planned,
    actual,
    vsPlan: planned != null ? (actual - planned) * dir : null,
    planEnd: rate ? addDays(startKey, Math.ceil((total / rate) * 7)) : null,
    remaining: Math.abs(current.weight - target),
    progress: total ? Math.min(1, Math.max(0, (actual * dir) / total)) : 1,
    reached: dir < 0 ? current.weight <= target : current.weight >= target,
  }
}
