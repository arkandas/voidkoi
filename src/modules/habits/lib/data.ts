'use client'

/**
 * Habits' data in the browser. Every change bumps one version number; the
 * pages read through these hooks and load again when it moves. A long range
 * loaded once serves every shorter one inside it.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'

import { api } from './api'
import { aggregate, sliceRange, type RangeData } from './aggregate'
import type { Goal, MealTemplate, WorkoutTemplate } from './api-types'
import type { DayKey } from './dates'

let version = 0
const listeners = new Set<() => void>()

/** Something was saved: everything shown loads again. */
export function bumpData() {
  version++
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useDataVersion = () => useSyncExternalStore(subscribe, () => version, () => 0)

interface Entry {
  start: DayKey
  end: DayKey
  v: number
  data: RangeData
  slices: Map<string, RangeData>
}

const cache = new Map<string, Entry>()

function slice(entry: Entry, start: DayKey, end: DayKey): RangeData {
  if (entry.start === start && entry.end === end) return entry.data
  const key = `${start}_${end}`
  let part = entry.slices.get(key)
  if (!part) {
    part = sliceRange(entry.data, start, end)
    entry.slices.set(key, part)
  }
  return part
}

/** The newest loaded range that covers these days. */
function lookup(start: DayKey, end: DayKey): { v: number; data: RangeData } | null {
  let best: Entry | null = null
  for (const entry of cache.values()) {
    if (entry.start <= start && entry.end >= end && (!best || entry.v > best.v)) best = entry
  }
  return best ? { v: best.v, data: slice(best, start, end) } : null
}

/** What was logged from `start` to `end`. While it loads again, the last copy stays on screen. */
export function useRange(start: DayKey | null, end: DayKey | null) {
  const v = useDataVersion()
  const hit = start && end ? lookup(start, end) : null
  const fresh = !!hit && hit.v === v
  const key = start && end ? `${start}_${end}_${v}` : null
  const [state, setState] = useState<{ data: RangeData | null; failed: boolean; key: string | null }>({ data: null, failed: false, key: null })

  useEffect(() => {
    if (!key || fresh || !start || !end) return
    let alive = true
    api
      .range(start, end)
      .then(range => {
        const data = aggregate(range)
        const existing = cache.get(`${start}_${end}`)
        if (!existing || existing.v <= v) cache.set(`${start}_${end}`, { start, end, v, data, slices: new Map() })
        if (alive) setState({ data, failed: false, key })
      })
      .catch(() => {
        if (alive) setState(current => ({ ...current, failed: true, key }))
      })
    return () => {
      alive = false
    }
  }, [key, fresh, start, end, v])

  if (fresh) return { data: hit!.data, loading: false, failed: false }
  const settled = state.key === key
  return { data: (settled ? state.data : null) ?? hit?.data ?? state.data, loading: !settled, failed: settled && state.failed }
}

let goalCache: { goal: Goal; v: number } | null = null

/** The weight goal and the weekly workouts. */
export function useGoal() {
  const v = useDataVersion()
  const [state, setState] = useState<{ goal: Goal | null; failed: boolean }>(() => ({ goal: goalCache?.goal ?? null, failed: false }))
  useEffect(() => {
    if (goalCache?.v === v) return
    let alive = true
    api
      .goal()
      .then(goal => {
        goalCache = { goal, v }
        if (alive) setState({ goal, failed: false })
      })
      .catch(() => {
        if (alive) setState(current => ({ ...current, failed: true }))
      })
    return () => {
      alive = false
    }
  }, [v])
  return { goal: goalCache?.goal ?? state.goal, ready: goalCache != null, failed: goalCache == null && state.failed }
}

export interface Templates {
  meals: MealTemplate[]
  workouts: WorkoutTemplate[]
}

/** Saved meals and workouts, for the kinds the account tracks. Null until they load. */
export function useTemplates(meals: boolean, workouts: boolean) {
  const v = useDataVersion()
  const [state, setState] = useState<{ templates: Templates | null; failed: boolean; key: string | null }>({
    templates: null,
    failed: false,
    key: null,
  })
  const key = `${v}:${meals}:${workouts}`
  useEffect(() => {
    let alive = true
    Promise.all([meals ? api.mealTemplates() : [], workouts ? api.workoutTemplates() : []])
      .then(([mealList, workoutList]) => {
        if (alive) setState({ templates: { meals: mealList, workouts: workoutList }, failed: false, key })
      })
      .catch(() => {
        if (alive) setState(current => ({ ...current, failed: true, key }))
      })
    return () => {
      alive = false
    }
  }, [key, meals, workouts])
  return { templates: state.templates, failed: state.key === key && state.failed }
}
