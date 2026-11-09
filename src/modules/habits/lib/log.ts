'use client'

/** The Log panel opens from anywhere in Habits: the header's button, a card's, or the L key. */
import type { Metric } from './metrics'

export interface LogRequest {
  tab?: Metric
}

const EVENT = 'habits-log'

export const openLog = (tab?: Metric) => window.dispatchEvent(new CustomEvent<LogRequest>(EVENT, { detail: { tab } }))

export const onOpenLog = (callback: (request: LogRequest) => void) => {
  const handler = (event: Event) => callback((event as CustomEvent<LogRequest>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
