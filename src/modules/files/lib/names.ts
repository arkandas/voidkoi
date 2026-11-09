export const NAME_MAX = 255

const CONTROL = /[\u0000-\u001f\u007f]/g

const COMPOUND_EXTENSIONS = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst']

/**
 * A file or folder name made safe to store: one path segment, no control
 * characters, at most NAME_MAX characters. A long name keeps its extension.
 * Null when nothing usable is left.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.normalize('NFC').replace(CONTROL, '').replace(/[/\\]/g, '_').trim()
  if (name === '' || name === '.' || name === '..') return null
  if ([...name].length > NAME_MAX) {
    const [base, extension] = splitExtension(name)
    const keep = extension.length <= 16 ? extension : ''
    name = [...(keep ? base : name)].slice(0, NAME_MAX - [...keep].length).join('').trimEnd() + keep
  }
  return name
}

/** What two names are compared by: names that differ only in case clash. */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase()
}

export function splitExtension(name: string): [string, string] {
  const lower = name.toLowerCase()
  for (const extension of COMPOUND_EXTENSIONS) {
    if (lower.endsWith(extension) && name.length > extension.length) {
      return [name.slice(0, -extension.length), name.slice(-extension.length)]
    }
  }
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return [name, '']
  return [name.slice(0, dot), name.slice(dot)]
}

/** "report.pdf" → "report (2).pdf". Folders keep their dots. */
export function numberedName(name: string, n: number, isFolder: boolean): string {
  if (n <= 0) return name
  const [base, extension] = isFolder ? [name, ''] : splitExtension(name)
  const suffix = ` (${n})${extension}`
  const room = NAME_MAX - [...suffix].length
  return [...base].slice(0, room).join('') + suffix
}

/** The name itself when nothing in `taken` clashes with it, else the first free numbered one. */
export function freeName(name: string, taken: ReadonlySet<string>, isFolder: boolean): string {
  for (let n = 0; ; n++) {
    const candidate = numberedName(name, n, isFolder)
    if (!taken.has(nameKey(candidate))) return candidate
  }
}

/**
 * The folders of a relative path, e.g. "Photos/2026" from a dropped folder.
 * Empty for no path, null when a segment can't be a name.
 */
export function splitPath(path: unknown): string[] | null {
  if (path === undefined || path === null || path === '') return []
  if (typeof path !== 'string' || path.length > 4096) return null
  const segments = path.split('/').filter(segment => segment !== '')
  if (segments.length > 64) return null
  const names = segments.map(cleanName)
  return names.every((segment): segment is string => segment !== null) ? names : null
}
