'use client'

import { useMemo } from 'react'

import { useMe } from '@/components/me'

import type { Metric } from './metrics'
import { tracksOf, usedMetrics } from './tracks'

export interface Tracks extends Record<Metric, boolean> {
  /** The parts the account uses, in order: weight, food, training. */
  list: Metric[]
  /** Saved meals or workouts: the Templates page. */
  templates: boolean
}

/** What this account tracks in Habits: the sub-apps it uses. */
export function useTracks(): Tracks {
  const { apps } = useMe()
  return useMemo(() => {
    const on = tracksOf(apps)
    return { ...on, list: usedMetrics(apps), templates: on.food || on.training }
  }, [apps])
}
