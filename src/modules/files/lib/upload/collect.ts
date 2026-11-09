/** Turning what was dropped or picked into files, each with the folder it sits in. */

export interface PickedFile {
  file: File
  /** The folders above it inside what was dropped, e.g. "Photos/2026", or "" at the top. */
  dir: string
}

export interface Picked {
  files: PickedFile[]
  /** Every folder that was dropped or picked, empty ones included. */
  dirs: string[]
}

/** What an operating system leaves in folders, which nobody means to upload. */
const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])

export function isJunk(name: string): boolean {
  return JUNK.has(name) || name.startsWith('._')
}

/** "Photos/2026/img.jpg" → "Photos/2026". */
export function dirOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/** A folder path and every folder above it, so empty parents are made too. */
export function withParents(dirs: Iterable<string>): string[] {
  const all = new Set<string>()
  for (const dir of dirs) {
    const parts = dir.split('/').filter(Boolean)
    for (let depth = 1; depth <= parts.length; depth++) all.add(parts.slice(0, depth).join('/'))
  }
  return [...all].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
}

/** From a file input, `webkitdirectory` or not. */
export function fromFileList(list: FileList | File[]): Picked {
  const files: PickedFile[] = []
  for (const file of Array.from(list)) {
    if (isJunk(file.name)) continue
    files.push({ file, dir: dirOf(file.webkitRelativePath || '') })
  }
  return { files, dirs: withParents(files.map(entry => entry.dir).filter(Boolean)) }
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/**
 * The entries of a drop. Must be called while the drop event is being
 * handled: the browser empties the DataTransfer as soon as it returns.
 */
export function entriesOf(transfer: DataTransfer): FileSystemEntry[] | null {
  const items = Array.from(transfer.items ?? [])
  if (items.length === 0 || typeof items[0]?.webkitGetAsEntry !== 'function') return null
  const entries = items
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null)
  // Nothing usable: the caller falls back to the plain file list.
  return entries.length > 0 ? entries : null
}

/** Walk dropped folders all the way down. */
export async function fromEntries(entries: FileSystemEntry[]): Promise<Picked> {
  const files: PickedFile[] = []
  const dirs: string[] = []

  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      if (isJunk(entry.name)) return
      files.push({ file: await fileOf(entry as FileSystemFileEntry), dir })
      return
    }
    if (!entry.isDirectory) return
    const path = dir ? `${dir}/${entry.name}` : entry.name
    dirs.push(path)
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // A directory reader hands out at most 100 entries at a time.
    for (;;) {
      const batch = await readEntries(reader)
      if (batch.length === 0) break
      for (const child of batch) await walk(child, path)
    }
  }

  for (const entry of entries) await walk(entry, '')
  return { files, dirs: withParents(dirs) }
}
