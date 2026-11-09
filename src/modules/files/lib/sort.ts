import type { ItemDto } from '@/modules/files/lib/api-types'

export type SortKey = 'name' | 'size' | 'modified'
export type SortDirection = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  direction: SortDirection
}

/**
 * Folders first, then files, each in the chosen order. Names compare the way
 * people read them: "file 2" before "file 10", and case doesn't matter.
 */
export function sortItems(items: ItemDto[], sort: Sort, locale: string): ItemDto[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    let order = 0
    if (sort.key === 'size') {
      order = a.kind === 'folder' ? (a.childCount ?? 0) - (b.childCount ?? 0) : a.size - b.size
    } else if (sort.key === 'modified') {
      order = a.updatedAt.localeCompare(b.updatedAt)
    }
    if (order === 0) order = collator.compare(a.name, b.name)
    return order * sign
  })
}
