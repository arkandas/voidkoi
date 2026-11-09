import { cache } from 'react'
import type { User } from '@/generated/prisma/client'
import type { EffectiveVisibility, PersonDto } from '@/modules/wiki/lib/api-types'
import { excerpt } from '@/modules/wiki/lib/markdown/render'
import { personOf } from '@/modules/wiki/lib/pages'
import { prisma } from '@/lib/prisma'
import { access, ancestry, listed, neighbours, type Entry, type Lock } from '@/modules/wiki/lib/tree'
import { rootLock, wikiContext, type WikiContext } from '@/modules/wiki/lib/wiki'

/** What an address shows to whoever is reading. */

export interface Crumb {
  title: string
  path: string
}

export interface PageText {
  title: string
  content: string
  /** When this text was saved, and by whom. */
  at: string
  by: PersonDto | null
  /** The editor's unpublished draft rather than the published text. */
  draft: boolean
}

export interface Card {
  id: number
  kind: 'page' | 'folder'
  title: string
  path: string
  /** A page's first words, or how many things a folder holds. */
  summary: string | null
  count: number
  locked: boolean
  unpublished: boolean
}

export interface PageView {
  kind: 'page'
  id: number
  path: string
  text: PageText
  crumbs: Crumb[]
  previous: Crumb | null
  next: Crumb | null
  effective: EffectiveVisibility
  /** For editors: never published, or changed since. */
  unpublished: boolean
  hasDraft: boolean
  isHome: boolean
}

export interface FolderView {
  kind: 'folder'
  id: number
  title: string
  path: string
  crumbs: Crumb[]
  cards: Card[]
  effective: EffectiveVisibility
}

export interface IndexView {
  kind: 'index'
  cards: Card[]
}

export type View =
  | PageView
  | FolderView
  | IndexView
  /** An old address: the path it has now, under whichever base it was asked for. */
  | { kind: 'redirect'; path: string }
  | { kind: 'notFound' }
  | { kind: 'signIn' }
  | { kind: 'password'; nodeId: number | null }

const crumb = (entry: Entry): Crumb => ({ title: entry.node.title, path: entry.path })

/** The address, without slashes at either end. */
export function joinPath(segments: string[] | undefined): string {
  return (segments ?? [])
    .map(segment => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
    .replace(/^\/+|\/+$/g, '')
}

/** The most folders deep an address can go, and its longest length: past these it names nothing. */
const MAX_DEPTH = 40
const MAX_PATH = 2000

/** Cards for what a folder (or the top level) holds, as this reader sees them. */
async function cardsFor(entries: Entry[], context: WikiContext): Promise<Card[]> {
  const { reader } = context
  const shown = entries.filter(entry => listed(entry, reader))
  const pages = shown.filter(entry => entry.node.kind === 'PAGE' && access(entry, reader) === 'ok')
  const revisionIds = pages.map(entry => entry.node.published_revision_id).filter((id): id is number => id !== null)
  const texts = revisionIds.length
    ? await prisma.wikiRevision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, content: true } })
    : []
  const contentOf = new Map(texts.map(text => [text.id, text.content]))
  return shown.map(entry => {
    const folder = entry.node.kind === 'FOLDER'
    const open = !folder && access(entry, reader) === 'ok'
    const content = open && entry.node.published_revision_id !== null ? contentOf.get(entry.node.published_revision_id) : undefined
    return {
      id: entry.node.id,
      kind: folder ? 'folder' : 'page',
      title: entry.node.title,
      path: entry.path,
      summary: content ? excerpt(content) || null : null,
      count: folder ? entry.children.filter(child => listed(child, reader)).length : 0,
      locked: !folder && access(entry, reader) === 'password',
      unpublished: !folder && entry.node.published_revision_id === null,
    }
  })
}

/** Why a reader can't open something: signing in, or a password. Null when they can. */
function refusal(entry: Entry | null, lock: Lock, context: WikiContext): View | null {
  if (entry) {
    const result = access(entry, context.reader)
    if (result === 'ok') return null
    if (result === 'hidden') return { kind: 'notFound' }
    if (result === 'password') return { kind: 'password', nodeId: entry.node.id }
    return { kind: 'signIn' }
  }
  if (context.reader.signedIn || lock.visibility === 'public') return null
  if (lock.visibility === 'password') return context.reader.unlocked(lock) ? null : { kind: 'password', nodeId: null }
  return { kind: 'signIn' }
}

async function pageText(entry: Entry, user: User | null, wantDraft: boolean, editor: boolean): Promise<PageText | null> {
  const node = await prisma.wikiNode.findUnique({
    where: { id: entry.node.id },
    include: { published: { include: { author: true } }, draft_updated_by: true },
  })
  if (!node) return null
  const showDraft = editor && node.draft_updated_at !== null && (wantDraft || !node.published)
  if (showDraft) {
    return {
      title: node.draft_title ?? node.title,
      content: node.draft_content ?? '',
      at: node.draft_updated_at!.toISOString(),
      by: personOf(node.draft_updated_by),
      draft: true,
    }
  }
  if (!node.published) return null
  return {
    title: node.published.title,
    content: node.published.content,
    at: node.published.created_at.toISOString(),
    by: personOf(node.published.author),
    draft: false,
  }
}

async function showPage(entry: Entry, context: WikiContext, wantDraft: boolean, isHome: boolean): Promise<View> {
  const { index, reader, user } = context
  const text = await pageText(entry, user, wantDraft, reader.editor)
  if (!text) return { kind: 'notFound' }
  const { previous, next } = neighbours(index, entry, reader)
  return {
    kind: 'page',
    id: entry.node.id,
    path: entry.path,
    text,
    crumbs: isHome ? [] : ancestry(entry).slice(0, -1).map(crumb),
    previous: previous ? crumb(previous) : null,
    next: next ? crumb(next) : null,
    effective: entry.lock.visibility,
    unpublished: entry.node.published_revision_id === null,
    hasDraft: entry.node.draft_updated_at !== null,
    isHome,
  }
}

/**
 * What `/a/b/c` shows this reader: a page, a folder's contents, the home page
 * or the list of everything at the top, a password or sign-in screen, a
 * redirect from an old address, or nothing.
 */
export const resolveView = cache(async (path: string, wantDraft: boolean): Promise<View> => {
  const context = await wikiContext()
  const { index, settings, reader } = context

  if (path === '') {
    const home = settings.home_page_id !== null ? index.byId.get(settings.home_page_id) : undefined
    if (home && home.node.kind === 'PAGE') {
      const result = access(home, reader)
      if (result === 'ok') return showPage(home, context, wantDraft, true)
      // The start page behind a password asks for it, rather than showing a list of locked pages.
      if (result === 'password') return { kind: 'password', nodeId: home.node.id }
    }
    const cards = await cardsFor(index.roots, context)
    if (cards.length > 0 || reader.editor) return { kind: 'index', cards }
    return refusal(null, rootLock(settings), context) ?? { kind: 'index', cards }
  }

  if (path.length > MAX_PATH || path.includes('\u0000') || path.split('/').length > MAX_DEPTH) return { kind: 'notFound' }
  const entry = index.byPath.get(path)
  if (!entry) {
    const lower = path.toLowerCase()
    if (lower !== path && index.byPath.has(lower)) return { kind: 'redirect', path: lower }
    const moved = await redirectFor(path, context)
    return moved !== null ? { kind: 'redirect', path: moved } : { kind: 'notFound' }
  }

  if (entry.node.kind === 'PAGE') {
    const refused = refusal(entry, entry.lock, context)
    if (refused) return refused
    return showPage(entry, context, wantDraft, settings.home_page_id === entry.node.id)
  }

  if (!listed(entry, reader)) {
    if (!reader.signedIn && entry.lock.visibility !== 'public') {
      return entry.lock.visibility === 'password' && !reader.unlocked(entry.lock)
        ? { kind: 'password', nodeId: entry.node.id }
        : { kind: 'signIn' }
    }
    return { kind: 'notFound' }
  }
  return {
    kind: 'folder',
    id: entry.node.id,
    title: entry.node.title,
    path: entry.path,
    crumbs: ancestry(entry).slice(0, -1).map(crumb),
    cards: await cardsFor(entry.children, context),
    effective: entry.lock.visibility,
  }
})

/**
 * Where an old address went: the page or folder that had it, or, for
 * something that was inside a folder that moved, the same path under the
 * folder's new address.
 */
async function redirectFor(path: string, context: WikiContext): Promise<string | null> {
  const parts = path.split('/')
  const prefixes = parts.map((_, at) => parts.slice(0, at + 1).join('/'))
  const rows = await prisma.wikiRedirect.findMany({ where: { path: { in: prefixes } } })
  // The longest old address that matches.
  const row = rows.sort((a, b) => b.path.length - a.path.length)[0]
  if (!row) return null
  const target = context.index.byId.get(row.node_id)
  if (!target) return null
  const rest = path.slice(row.path.length).replace(/^\//, '')
  const to = rest ? `${target.path}/${rest}` : target.path
  const landing = context.index.byPath.get(to)
  // Only to something that exists and this reader may know about, and never back to where it started.
  if (to === path || !landing || !listed(landing, context.reader)) return null
  return to
}
