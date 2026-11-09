import type { StickyColor } from '@/modules/tasks/lib/api-types'
import { TASKS_LIMITS, isFiniteNumber, isStickyColor } from '@/modules/tasks/lib/validate'

/** A sticky note's columns, as a request may change them. */
export interface StickyChanges {
  content?: string
  color?: StickyColor
  position_x?: number
  position_y?: number
  width?: number
  height?: number
  z_index?: number
}

/** Reads what a request changes on a sticky note: only the fields it sends. Null when one isn't valid. */
export function readStickyChanges(body: Record<string, unknown>): StickyChanges | null {
  const changes: StickyChanges = {}
  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || body.content.length > TASKS_LIMITS.stickyNote) return null
    changes.content = body.content
  }
  if (body.color !== undefined) {
    if (!isStickyColor(body.color)) return null
    changes.color = body.color
  }
  for (const [key, column] of [['x', 'position_x'], ['y', 'position_y']] as const) {
    if (body[key] === undefined) continue
    if (!isFiniteNumber(body[key])) return null
    changes[column] = body[key]
  }
  for (const [key, column] of [['width', 'width'], ['height', 'height'], ['z', 'z_index']] as const) {
    if (body[key] === undefined) continue
    if (!isFiniteNumber(body[key])) return null
    changes[column] = Math.round(body[key])
  }
  return changes
}
