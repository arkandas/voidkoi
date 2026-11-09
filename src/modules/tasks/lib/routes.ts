import { uses } from '@/modules/registry'

export type TasksPart = 'boards' | 'todo' | 'stickies'

/** The parts of Tasks, in the order the header shows them, and where each lives. */
export const PARTS: ReadonlyArray<{ id: TasksPart; href: string }> = [
  { id: 'boards', href: '/tasks/boards' },
  { id: 'todo', href: '/tasks/todo' },
  { id: 'stickies', href: '/tasks/sticky-notes' },
]

/** The parts of Tasks an account with these app keys uses. */
export function partsUsed(apps: readonly string[]): TasksPart[] {
  return PARTS.filter(part => uses(apps, 'tasks', part.id)).map(part => part.id)
}

/** Where Tasks opens: its first part the account uses, or null when it uses none. */
export function firstPartHref(apps: readonly string[]): string | null {
  return PARTS.find(part => uses(apps, 'tasks', part.id))?.href ?? null
}

export function boardHref(id: number): string {
  return `/tasks/boards/${id}`
}
