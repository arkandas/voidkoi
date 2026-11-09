import { STICKY_COLORS } from '@/modules/tasks/lib/api-types'

export { STICKY_COLORS }

/** The classes of a note in a colour, yellow for one it doesn't know. */
export function stickyColorClass(color: string): string {
  const known = (STICKY_COLORS as readonly string[]).includes(color)
  return `sticky-note sticky-${known ? color : 'yellow'}`
}
