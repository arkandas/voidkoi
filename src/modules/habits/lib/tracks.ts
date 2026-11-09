import { uses } from '@/modules/registry'

import { METRICS, type Metric } from './metrics'

/**
 * The parts of Habits an account uses, in order. An account with Habits but
 * none of its parts named (the picker never leaves it so) takes all of them.
 */
export function usedMetrics(apps: readonly string[]): Metric[] {
  const on = METRICS.filter(metric => uses(apps, 'habits', metric))
  return on.length || !uses(apps, 'habits') ? on : [...METRICS]
}

/** Which parts of Habits an account uses, from its app keys. */
export function tracksOf(apps: readonly string[]): Record<Metric, boolean> {
  const on = usedMetrics(apps)
  return Object.fromEntries(METRICS.map(metric => [metric, on.includes(metric)])) as Record<Metric, boolean>
}
