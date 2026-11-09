import type { EffectiveVisibility, TreeNodeDto, VisibilityDto } from '@/modules/wiki/lib/api-types'

/** The parts of a node the tree needs: no page text. */
export interface NodeRecord {
  id: number
  kind: 'FOLDER' | 'PAGE'
  parent_id: number | null
  position: number
  title: string
  slug: string
  visibility: 'INHERIT' | 'PUBLIC' | 'PRIVATE' | 'PASSWORD'
  password_hash: string | null
  published_revision_id: number | null
  draft_updated_at: Date | null
  updated_at: Date
}

/** What decides who reads a node: the nearest setting up the tree, or the wiki's own. */
export interface Lock {
  visibility: EffectiveVisibility
  /** The node that sets it; 0 for the wiki itself. A password unlocks everything under it. */
  lockId: number
  hash: string | null
}

export interface Entry {
  node: NodeRecord
  path: string
  depth: number
  parent: Entry | null
  children: Entry[]
  lock: Lock
}

export interface WikiIndex {
  roots: Entry[]
  byId: Map<number, Entry>
  byPath: Map<string, Entry>
  /** Every entry, folders before what they hold, in reading order. */
  order: Entry[]
}

export const NODE_SELECT = {
  id: true,
  kind: true,
  parent_id: true,
  position: true,
  title: true,
  slug: true,
  visibility: true,
  password_hash: true,
  published_revision_id: true,
  draft_updated_at: true,
  updated_at: true,
} as const

function byPosition(a: Entry, b: Entry): number {
  return a.node.position - b.node.position || a.node.title.localeCompare(b.node.title) || a.node.id - b.node.id
}

export function buildIndex(nodes: NodeRecord[], root: Lock): WikiIndex {
  const byId = new Map<number, Entry>()
  for (const node of nodes) byId.set(node.id, { node, path: '', depth: 0, parent: null, children: [], lock: root })

  const roots: Entry[] = []
  for (const entry of byId.values()) {
    const parentId = entry.node.parent_id
    if (parentId === null) roots.push(entry)
    else {
      const parent = byId.get(parentId)
      // Its folder is gone (deleted, or never loaded): so is it.
      if (!parent) continue
      entry.parent = parent
      parent.children.push(entry)
    }
  }

  const byPath = new Map<string, Entry>()
  const order: Entry[] = []
  const place = (entries: Entry[], parent: Entry | null): void => {
    entries.sort(byPosition)
    for (const entry of entries) {
      entry.depth = parent ? parent.depth + 1 : 0
      entry.path = parent ? `${parent.path}/${entry.node.slug}` : entry.node.slug
      entry.lock = lockOf(entry.node, parent ? parent.lock : root)
      byPath.set(entry.path, entry)
      order.push(entry)
      place(entry.children, entry)
    }
  }
  place(roots, null)

  // Unreachable entries (a loop, which the app never makes) stay out of the maps.
  for (const [id, entry] of byId) if (!byPath.has(entry.path) || byPath.get(entry.path) !== entry) byId.delete(id)
  return { roots, byId, byPath, order }
}

function lockOf(node: NodeRecord, inherited: Lock): Lock {
  switch (node.visibility) {
    case 'PUBLIC':
      return { visibility: 'public', lockId: node.id, hash: null }
    case 'PRIVATE':
      return { visibility: 'private', lockId: node.id, hash: null }
    case 'PASSWORD':
      // A password setting with no password can't be opened by anyone outside: like Private.
      return node.password_hash
        ? { visibility: 'password', lockId: node.id, hash: node.password_hash }
        : { visibility: 'private', lockId: node.id, hash: null }
    default:
      return inherited
  }
}

export function visibilityDto(value: NodeRecord['visibility']): VisibilityDto {
  return value.toLowerCase() as VisibilityDto
}

/* Who reads what ---------------------------------------------------------- */

export interface Reader {
  /** Editors and admins see everything, drafts and unpublished pages too. */
  editor: boolean
  signedIn: boolean
  /** Whether this visitor has typed the password of a lock. */
  unlocked(lock: Lock): boolean
}

export type Access = 'ok' | 'signIn' | 'password' | 'hidden'

/** Whether the reader may open a page (or a folder, by its own setting). */
export function access(entry: Entry, reader: Reader): Access {
  if (reader.editor) return 'ok'
  if (entry.node.kind === 'PAGE' && entry.node.published_revision_id === null) return 'hidden'
  if (reader.signedIn) return 'ok'
  const { lock } = entry
  if (lock.visibility === 'public') return 'ok'
  if (lock.visibility === 'password') return reader.unlocked(lock) ? 'ok' : 'password'
  return 'signIn'
}

/** Every page under a folder, at any depth. */
export function pagesUnder(entry: Entry): Entry[] {
  const pages: Entry[] = []
  const walk = (entries: Entry[]): void => {
    for (const child of entries) {
      if (child.node.kind === 'PAGE') pages.push(child)
      walk(child.children)
    }
  }
  walk(entry.children)
  return pages
}

/**
 * Whether the reader sees it in the tree: pages they can open, password pages
 * they haven't unlocked (with a lock), and folders that hold any of those.
 */
export function listed(entry: Entry, reader: Reader): boolean {
  if (reader.editor) return true
  if (entry.node.kind === 'PAGE') {
    const result = access(entry, reader)
    return result === 'ok' || result === 'password'
  }
  return pagesUnder(entry).some(page => listed(page, reader))
}

export function readable(entry: Entry, reader: Reader): boolean {
  if (entry.node.kind === 'PAGE') return access(entry, reader) === 'ok'
  return reader.editor || pagesUnder(entry).some(page => access(page, reader) === 'ok')
}

export function treeFor(index: WikiIndex, reader: Reader): TreeNodeDto[] {
  return index.order
    .filter(entry => listed(entry, reader))
    .map(entry => ({
      id: entry.node.id,
      kind: entry.node.kind === 'FOLDER' ? 'folder' : 'page',
      parentId: entry.node.parent_id,
      title: entry.node.title,
      path: entry.path,
      locked: entry.node.kind === 'PAGE' && access(entry, reader) === 'password',
      draft: reader.editor && entry.node.draft_updated_at !== null && entry.node.published_revision_id !== null,
      unpublished: reader.editor && entry.node.kind === 'PAGE' && entry.node.published_revision_id === null,
      visibility: reader.editor ? visibilityDto(entry.node.visibility) : 'inherit',
      effective: entry.lock.visibility,
    }))
}

/** The pages before and after one, in the order the tree shows them, that the reader can open. */
export function neighbours(index: WikiIndex, entry: Entry, reader: Reader): { previous: Entry | null; next: Entry | null } {
  const pages = index.order.filter(other => other.node.kind === 'PAGE' && access(other, reader) === 'ok')
  const at = pages.indexOf(entry)
  if (at === -1) return { previous: null, next: null }
  return { previous: pages[at - 1] ?? null, next: pages[at + 1] ?? null }
}

/** The entry and the folders above it, from the top. */
export function ancestry(entry: Entry): Entry[] {
  const chain: Entry[] = []
  for (let at: Entry | null = entry; at; at = at.parent) chain.unshift(at)
  return chain
}

/** Whether `inner` is `outer` or inside it. */
export function isWithin(inner: Entry, outer: Entry): boolean {
  for (let at: Entry | null = inner; at; at = at.parent) if (at === outer) return true
  return false
}
