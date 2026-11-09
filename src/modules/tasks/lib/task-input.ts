import { requiredText } from '@/lib/validate'
import type { Priority } from '@/modules/tasks/lib/api-types'
import { TASKS_LIMITS, isPriority, isValidOptionalText, optionalText, parseIndex, parseOptionalDate } from '@/modules/tasks/lib/validate'

/** The fields a task and a to-do share, as a request may change them. */
export interface ItemChanges {
  title?: string
  description?: string | null
  priority?: Priority
  deadline?: Date | null
  completed?: boolean
  position?: number
}

/**
 * Reads the fields of a task or a to-do from a request body: only those it
 * sends. False when one of them isn't valid; 'title' when the title is missing.
 */
export function readItemChanges(body: Record<string, unknown>): ItemChanges | 'invalid' | 'title' {
  const changes: ItemChanges = {}
  if (body.title !== undefined) {
    const title = requiredText(body.title, TASKS_LIMITS.title)
    if (!title) return 'title'
    changes.title = title
  }
  if ('description' in body) {
    if (!isValidOptionalText(body.description, TASKS_LIMITS.description)) return 'invalid'
    changes.description = optionalText(body.description, TASKS_LIMITS.description) ?? null
  }
  if (body.priority !== undefined) {
    if (!isPriority(body.priority)) return 'invalid'
    changes.priority = body.priority
  }
  if (body.deadline !== undefined) {
    const deadline = parseOptionalDate(body.deadline)
    if (deadline === 'invalid') return 'invalid'
    changes.deadline = deadline ?? null
  }
  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') return 'invalid'
    changes.completed = body.completed
  }
  if (body.position !== undefined) {
    const position = parseIndex(body.position)
    if (position === null) return 'invalid'
    changes.position = position
  }
  return changes
}
