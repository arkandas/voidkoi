import bcrypt from 'bcryptjs'
import type { WikiNode as Node, User } from '@/generated/prisma/client'
import { toPerson } from '@/lib/accounts'
import type {
  DraftConflict,
  DraftSaved,
  PageDetail,
  PersonDto,
  RevisionDetail,
  RevisionDto,
  TrashEntry,
  VisibilityDto,
} from '@/modules/wiki/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { imageKeysIn } from '@/modules/wiki/lib/markdown/images'
import { prisma, type Tx } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/request'
import { getSettings } from '@/modules/wiki/lib/settings'
import { isSlug, RESERVED_SLUGS, slugify, uniqueSlug } from '@/modules/wiki/lib/slug'
import { isWithin, visibilityDto, type Entry, type WikiIndex } from '@/modules/wiki/lib/tree'
import { LIMITS, withoutNul } from '@/modules/wiki/lib/validate'
import { loadIndex, rootLock } from '@/modules/wiki/lib/wiki'

/** How long deleted pages wait in the trash. */
export const TRASH_DAYS = 30

/** Who wrote something, or null once their account is gone. */
export function personOf(user: Pick<User, 'id' | 'username' | 'name' | 'avatar_key'> | null): PersonDto | null {
  return user ? toPerson(user) : null
}

async function freshIndex(db: Tx | typeof prisma = prisma): Promise<WikiIndex> {
  return loadIndex(await getSettings(), db)
}

/**
 * Changes to where things are (adding, moving, renaming an address, deleting,
 * restoring) wait for each other, so two at once can't take the same address
 * or put a folder inside itself.
 */
async function lockTree(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7341)`
}

/**
 * A change to the tree, under its lock. A big folder takes a while to move, so
 * it gets longer than Prisma's five seconds; an address someone took at the
 * same moment comes back as taken rather than as an error.
 */
async function treeChange<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(
      async tx => {
        await lockTree(tx)
        return work(tx)
      },
      { timeout: 30_000, maxWait: 10_000 },
    )
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError('slugTaken', 409)
    throw error
  }
}

/** The page's row, held until the transaction ends, so saves and publishes of it take turns. */
async function holdPage(tx: Tx, id: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM wiki_nodes WHERE id = ${id} FOR UPDATE`
}

function entryOf(index: WikiIndex, id: number): Entry {
  const entry = index.byId.get(id)
  if (!entry) throw new ApiError('notFound', 404)
  return entry
}

/** The slugs already used next to a new or moved node, leaving `except` out. */
async function siblingSlugs(tx: Tx | typeof prisma, parentId: number | null, except?: number): Promise<Set<string>> {
  const siblings = await tx.wikiNode.findMany({
    where: { parent_id: parentId, deleted_at: null, ...(except ? { NOT: { id: except } } : {}) },
    select: { slug: true },
  })
  return new Set(siblings.map(sibling => sibling.slug))
}

/* Reading ------------------------------------------------------------------ */

export async function pageDetail(id: number): Promise<PageDetail> {
  const [index, settings] = await Promise.all([freshIndex(), getSettings()])
  const entry = entryOf(index, id)
  const node = await prisma.wikiNode.findUniqueOrThrow({
    where: { id },
    include: { published: { include: { author: true } }, draft_updated_by: true },
  })
  const hasDraft = node.draft_updated_at !== null
  // What Inherit gives here: the setting of the folder above, or the wiki's.
  const above = entry.parent ? entry.parent.lock : rootLock(settings)
  const source = above.lockId === 0 ? null : index.byId.get(above.lockId) ?? null
  return {
    id: node.id,
    kind: node.kind === 'FOLDER' ? 'folder' : 'page',
    parentId: node.parent_id,
    title: node.title,
    slug: node.slug,
    path: entry.path,
    visibility: visibilityDto(node.visibility),
    hasPassword: node.password_hash !== null,
    effective: entry.lock.visibility,
    inherits: above.visibility,
    inheritedFrom: source ? source.node.title : null,
    isHome: settings.home_page_id === node.id,
    published: node.published
      ? {
          number: node.published.number,
          title: node.published.title,
          content: node.published.content,
          at: node.published.created_at.toISOString(),
          by: personOf(node.published.author),
        }
      : null,
    draft: hasDraft
      ? {
          title: node.draft_title ?? node.title,
          content: node.draft_content ?? '',
          at: node.draft_updated_at!.toISOString(),
          by: personOf(node.draft_updated_by),
        }
      : null,
    version: node.draft_version,
  }
}

/* Creating ----------------------------------------------------------------- */

export async function createNode(user: User, input: { kind: 'FOLDER' | 'PAGE'; parentId: number | null; title: string }): Promise<Node> {
  return treeChange(async tx => {
    if (input.parentId !== null) {
      const parent = await tx.wikiNode.findUnique({ where: { id: input.parentId }, select: { kind: true, deleted_at: true } })
      if (!parent || parent.deleted_at || parent.kind !== 'FOLDER') throw new ApiError('folderNotFound', 404)
    }
    const slug = uniqueSlug(slugify(input.title), await siblingSlugs(tx, input.parentId), input.parentId === null)
    const last = await tx.wikiNode.aggregate({ where: { parent_id: input.parentId, deleted_at: null }, _max: { position: true } })
    const now = new Date()
    return tx.wikiNode.create({
      data: {
        kind: input.kind,
        parent_id: input.parentId,
        position: (last._max.position ?? -1) + 1,
        title: input.title,
        slug,
        ...(input.kind === 'PAGE'
          ? { draft_title: input.title, draft_content: '', draft_updated_at: now, draft_updated_by_id: user.id }
          : {}),
      },
    })
  })
}

/* Drafts and publishing ---------------------------------------------------- */

async function conflict(id: number): Promise<DraftConflict> {
  const node = await prisma.wikiNode.findUniqueOrThrow({ where: { id }, include: { draft_updated_by: true, published: true } })
  return {
    error: 'editConflict',
    title: node.draft_title ?? node.published?.title ?? node.title,
    content: node.draft_content ?? node.published?.content ?? '',
    version: node.draft_version,
    by: personOf(node.draft_updated_by),
    at: (node.draft_updated_at ?? node.updated_at).toISOString(),
  }
}

/**
 * Save the title and text being edited. `version` is the one they were read
 * at: if someone saved since, nothing is written and their draft comes back.
 */
export async function saveDraft(
  user: User,
  id: number,
  input: { title: string; content: string; version: number },
): Promise<DraftSaved | DraftConflict> {
  const node = await prisma.wikiNode.findUnique({ where: { id } })
  if (!node || node.deleted_at || node.kind !== 'PAGE') throw new ApiError('notFound', 404)
  const now = new Date()
  const { count } = await prisma.wikiNode.updateMany({
    where: { id, draft_version: input.version, deleted_at: null },
    data: {
      draft_title: input.title,
      draft_content: input.content,
      draft_version: { increment: 1 },
      draft_updated_at: now,
      draft_updated_by_id: user.id,
      // A page never published goes by its draft's title in the tree.
      ...(node.published_revision_id === null ? { title: input.title } : {}),
    },
  })
  if (count === 0) return conflict(id)
  return { version: input.version + 1, at: now.toISOString() }
}

/**
 * Publish the draft as a new revision. Its images become the page's. `version`
 * is the draft the editor last saw: if someone saved over it since, nothing
 * is published and they are told.
 */
export async function publish(user: User, id: number, message: string | null, version: number | null): Promise<void> {
  await prisma.$transaction(async tx => {
    await holdPage(tx, id)
    const node = await tx.wikiNode.findUnique({ where: { id }, include: { published: true } })
    if (!node || node.deleted_at || node.kind !== 'PAGE') throw new ApiError('notFound', 404)
    if (version !== null && node.draft_version !== version) throw new ApiError('editConflict', 409)
    if (node.draft_updated_at === null && node.published) throw new ApiError('nothingToPublish', 400)
    const title = (node.draft_title ?? node.published?.title ?? node.title).trim()
    const content = node.draft_content ?? node.published?.content ?? ''
    if (!title) throw new ApiError('invalidTitle', 400)
    const last = await tx.wikiRevision.aggregate({ where: { page_id: id }, _max: { number: true } })
    const revision = await tx.wikiRevision.create({
      data: { page_id: id, number: (last._max.number ?? 0) + 1, title, content, message, author_id: user.id },
    })
    await tx.wikiNode.update({
      where: { id },
      data: {
        title,
        published_revision_id: revision.id,
        draft_title: null,
        draft_content: null,
        draft_updated_at: null,
        draft_updated_by_id: null,
        draft_version: { increment: 1 },
      },
    })
    await linkImages(tx, id, content)
  })
}

/** Which uploaded images the published text shows, so they are served to whoever may read the page. */
async function linkImages(tx: Tx, pageId: number, content: string): Promise<void> {
  const keys = imageKeysIn(content)
  const images = keys.length ? await tx.wikiImage.findMany({ where: { key: { in: keys } }, select: { id: true } }) : []
  await tx.wikiPageImage.deleteMany({ where: { page_id: pageId } })
  if (images.length) {
    await tx.wikiPageImage.createMany({ data: images.map(image => ({ page_id: pageId, image_id: image.id })), skipDuplicates: true })
  }
}

/** Throw the draft away and go back to what is published. */
export async function discardDraft(id: number): Promise<void> {
  await prisma.$transaction(async tx => {
    await holdPage(tx, id)
    const node = await tx.wikiNode.findUnique({ where: { id } })
    if (!node || node.deleted_at || node.kind !== 'PAGE') throw new ApiError('notFound', 404)
    if (node.published_revision_id === null) throw new ApiError('notPublished', 400)
    await tx.wikiNode.update({
      where: { id },
      data: { draft_title: null, draft_content: null, draft_updated_at: null, draft_updated_by_id: null, draft_version: { increment: 1 } },
    })
  })
}

/** Put an old revision's title and text into the draft, to look over and publish. */
export async function restoreRevision(user: User, id: number, revisionId: number): Promise<void> {
  const revision = await prisma.wikiRevision.findFirst({ where: { id: revisionId, page_id: id } })
  if (!revision) throw new ApiError('notFound', 404)
  const { count } = await prisma.wikiNode.updateMany({
    where: { id, deleted_at: null },
    data: {
      draft_title: revision.title,
      draft_content: revision.content,
      draft_updated_at: new Date(),
      draft_updated_by_id: user.id,
      draft_version: { increment: 1 },
    },
  })
  if (count === 0) throw new ApiError('notFound', 404)
}

/* History ------------------------------------------------------------------ */

export async function revisions(pageId: number): Promise<RevisionDto[]> {
  const [node, list] = await Promise.all([
    prisma.wikiNode.findUnique({ where: { id: pageId }, select: { published_revision_id: true } }),
    prisma.wikiRevision.findMany({ where: { page_id: pageId }, include: { author: true }, orderBy: { number: 'desc' } }),
  ])
  return list.map(revision => ({
    id: revision.id,
    number: revision.number,
    title: revision.title,
    message: revision.message,
    author: personOf(revision.author),
    createdAt: revision.created_at.toISOString(),
    published: revision.id === node?.published_revision_id,
  }))
}

export async function revisionDetail(pageId: number, revisionId: number): Promise<RevisionDetail> {
  const [node, revision] = await Promise.all([
    prisma.wikiNode.findUnique({ where: { id: pageId }, select: { published_revision_id: true } }),
    prisma.wikiRevision.findFirst({ where: { id: revisionId, page_id: pageId }, include: { author: true } }),
  ])
  if (!revision) throw new ApiError('notFound', 404)
  return {
    id: revision.id,
    number: revision.number,
    title: revision.title,
    message: revision.message,
    author: personOf(revision.author),
    createdAt: revision.created_at.toISOString(),
    published: revision.id === node?.published_revision_id,
    content: revision.content,
  }
}

/* Settings, moving and addresses ------------------------------------------ */

/** The longest address kept as a redirect. */
const REDIRECT_MAX = 1000

/**
 * Keep the address a node had, so links to it keep working. Links to what is
 * inside it follow from this one: the rest of their path is added to its new
 * address.
 */
async function rememberPath(tx: Tx, entry: Entry): Promise<void> {
  if (entry.path.length > REDIRECT_MAX) return
  await tx.wikiRedirect.upsert({
    where: { path: entry.path },
    update: { node_id: entry.node.id },
    create: { path: entry.path, node_id: entry.node.id },
  })
}

export interface NodeChanges {
  title?: string
  slug?: string
  visibility?: VisibilityDto
  /** Undefined keeps it; a string sets it. Only used with Password. */
  password?: string
}

export async function updateNode(id: number, changes: NodeChanges): Promise<void> {
  const index = await freshIndex()
  const entry = entryOf(index, id)
  const node = entry.node
  const data: Record<string, unknown> = {}

  if (changes.title !== undefined) {
    // A page's title is part of its text: it changes through the draft. A folder has only this one.
    if (node.kind !== 'FOLDER') throw new ApiError('invalidInput', 400)
    data.title = changes.title
  }

  if (changes.visibility !== undefined) {
    const visibility = changes.visibility.toUpperCase() as Node['visibility']
    data.visibility = visibility
    if (visibility === 'PASSWORD') {
      if (changes.password) data.password_hash = await bcrypt.hash(changes.password, 10)
      else if (!node.password_hash) throw new ApiError('passwordRequired', 400)
    } else data.password_hash = null
  }

  const slugChanged = changes.slug !== undefined && changes.slug !== node.slug
  if (slugChanged && !isSlug(changes.slug)) throw new ApiError('invalidSlug', 400)

  if (!slugChanged) {
    await prisma.wikiNode.update({ where: { id }, data })
    return
  }
  await treeChange(async tx => {
    // Where it is now, under the lock: it may have moved since the read above.
    const current = entryOf(await freshIndex(tx), id)
    const slug = changes.slug!
    if (current.node.parent_id === null && RESERVED_SLUGS.has(slug)) throw new ApiError('reservedSlug', 400)
    if ((await siblingSlugs(tx, current.node.parent_id, id)).has(slug)) throw new ApiError('slugTaken', 409)
    await rememberPath(tx, current)
    await tx.wikiNode.update({ where: { id }, data: { ...data, slug } })
  })
}

/** Put a node into a folder (or the top level) at `position` among what is there. */
export async function moveNode(id: number, parentId: number | null, position: number): Promise<void> {
  await treeChange(async tx => {
    const index = await freshIndex(tx)
    const entry = entryOf(index, id)
    if (parentId !== null) {
      const parent = index.byId.get(parentId)
      if (!parent || parent.node.kind !== 'FOLDER') throw new ApiError('folderNotFound', 404)
      if (isWithin(parent, entry)) throw new ApiError('cannotMoveIntoItself', 400)
    }
    const moving = entry.node.parent_id !== parentId
    let slug = entry.node.slug
    if (moving) {
      slug = uniqueSlug(slug, await siblingSlugs(tx, parentId, id), parentId === null)
      await rememberPath(tx, entry)
    }
    const siblings = await tx.wikiNode.findMany({
      where: { parent_id: parentId, deleted_at: null, NOT: { id } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    })
    const at = Math.max(0, Math.min(position, siblings.length))
    const ordered = [...siblings.slice(0, at).map(s => s.id), id, ...siblings.slice(at).map(s => s.id)]
    await tx.wikiNode.update({ where: { id }, data: { parent_id: parentId, slug } })
    for (const [place, nodeId] of ordered.entries()) await tx.wikiNode.update({ where: { id: nodeId }, data: { position: place } })
  })
}

/* Trash -------------------------------------------------------------------- */

export async function trashNode(id: number): Promise<void> {
  await treeChange(async tx => {
    const entry = entryOf(await freshIndex(tx), id)
    const ids: number[] = []
    const walk = (each: Entry): void => {
      ids.push(each.node.id)
      each.children.forEach(walk)
    }
    walk(entry)
    await tx.wikiNode.updateMany({ where: { id: { in: ids } }, data: { deleted_at: new Date(), trash_root_id: id } })
  })
}

export async function trashList(): Promise<TrashEntry[]> {
  const roots = await prisma.wikiNode.findMany({
    where: { deleted_at: { not: null }, trash_root_id: { not: null } },
    orderBy: { deleted_at: 'desc' },
    include: { parent: { select: { title: true } } },
  })
  const tops = roots.filter(node => node.trash_root_id === node.id)
  const counts = await prisma.wikiNode.groupBy({
    by: ['trash_root_id'],
    where: { trash_root_id: { in: tops.map(node => node.id) } },
    _count: true,
  })
  const inside = new Map(counts.map(count => [count.trash_root_id, count._count]))
  return tops.map(node => ({
    id: node.id,
    kind: node.kind === 'FOLDER' ? 'folder' : 'page',
    title: node.title,
    from: node.parent?.title ?? null,
    deletedAt: node.deleted_at!.toISOString(),
    inside: (inside.get(node.id) ?? 1) - 1,
  }))
}

/** Bring something back with all it held. Its folder gone: to the top level. Its address taken: a new one. */
export async function restoreNode(id: number): Promise<{ path: string }> {
  await treeChange(async tx => {
    // Read under the lock: its folder may be going to the trash at the same moment.
    const node = await tx.wikiNode.findUnique({ where: { id }, include: { parent: true } })
    if (!node || node.trash_root_id !== id) throw new ApiError('notFound', 404)
    const parentId = node.parent && !node.parent.deleted_at ? node.parent_id : null
    const slug = uniqueSlug(node.slug, await siblingSlugs(tx, parentId, id), parentId === null)
    const last = await tx.wikiNode.aggregate({ where: { parent_id: parentId, deleted_at: null }, _max: { position: true } })
    await tx.wikiNode.updateMany({ where: { trash_root_id: id }, data: { deleted_at: null, trash_root_id: null } })
    await tx.wikiNode.update({ where: { id }, data: { parent_id: parentId, slug, position: (last._max.position ?? -1) + 1 } })
  })
  const entry = (await freshIndex()).byId.get(id)
  return { path: entry?.path ?? '' }
}

export async function deleteForever(id: number): Promise<void> {
  const node = await prisma.wikiNode.findUnique({ where: { id } })
  if (!node || node.trash_root_id !== id) throw new ApiError('notFound', 404)
  await prisma.wikiNode.delete({ where: { id } })
}

export async function emptyTrash(): Promise<void> {
  await prisma.wikiNode.deleteMany({ where: { deleted_at: { not: null } } })
}

/** Delete for good what has been in the trash longer than TRASH_DAYS. */
export async function purgeTrash(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000)
  const { count } = await prisma.wikiNode.deleteMany({ where: { deleted_at: { lt: before } } })
  return count
}

/* Titles ------------------------------------------------------------------ */

export function parseTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const title = withoutNul(value).replace(/\s+/g, ' ').trim()
  return title.length > 0 && title.length <= LIMITS.title ? title : null
}
