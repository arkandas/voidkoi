/** A folder's colour and icon, as stored. The pictures and names that go with them are in the components and messages. */

export const FOLDER_COLORS = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'fuchsia',
  'pink',
] as const

export type FolderColor = (typeof FOLDER_COLORS)[number]

export const FOLDER_ICONS = [
  'folder',
  'note',
  'star',
  'pin',
  'bookmark',
  'idea',
  'lab',
  'book',
  'target',
  'work',
  'heart',
  'code',
] as const

export type FolderIcon = (typeof FOLDER_ICONS)[number]

/** Colours from before the palette grew, drawn as their nearest one today. */
const LEGACY_COLORS: Record<string, FolderColor> = {
  clay: 'red',
  sage: 'green',
  rose: 'pink',
  stone: 'indigo',
  emerald: 'green',
  sky: 'cyan',
  purple: 'violet',
  slate: 'indigo',
}

export function isFolderColor(value: unknown): value is FolderColor {
  return typeof value === 'string' && (FOLDER_COLORS as readonly string[]).includes(value)
}

export function isFolderIcon(value: unknown): value is FolderIcon {
  return typeof value === 'string' && (FOLDER_ICONS as readonly string[]).includes(value)
}

/** The colour a folder is drawn in, if any. */
export function folderColor(value: string | null | undefined): FolderColor | null {
  if (!value) return null
  if (isFolderColor(value)) return value
  return LEGACY_COLORS[value] ?? null
}

/** Folders in the order the list shows them: by name, as people read it. */
export function sortFolders<T extends { name: string }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name))
}
