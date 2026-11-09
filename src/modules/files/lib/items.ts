import { toPerson } from '@/lib/accounts'
import type { Item, User } from '@/generated/prisma/client'
import type { Crumb, FolderListing, ItemDto, SearchResult, TrashEntry } from '@/modules/files/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { freeName, nameKey } from '@/modules/files/lib/names'
import { prisma, type Tx } from '@/lib/prisma'
import { removeStored } from '@/lib/storage'
import { escapeLike } from '@/lib/like'

/** Deleted things stay this long in the trash. */
export const TRASH_DAYS = 30

const TREE_LOCK = 41_001

export function toItemDto(item: Item, extra: Partial<ItemDto> = {}): ItemDto {
  return {
    id: item.id,
    kind: item.kind === 'FOLDER' ? 'folder' : 'file',
    name: item.name,
    size: Number(item.size),
    mime: item.mime,
    parentId: item.parent_id,
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
    hasThumbnail: item.has_thumbnail,
    hasPreview: item.has_preview,
    width: item.width,
    height: item.height,
    ...extra,
  }
}

export { toPerson }

/**
 * Run `work` with one person's tree to itself, so two changes can't both take
 * the same name or move folders into each other.
 */
export function withTree<T>(ownerId: number, work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${TREE_LOCK}::int, ${ownerId}::int)`
      return work(tx)
    },
    { timeout: 60_000, maxWait: 30_000 },
  )
}

async function takenNames(tx: Tx, ownerId: number, parentId: number | null, exceptId?: number): Promise<Set<string>> {
  const rows = await tx.item.findMany({
    where: { owner_id: ownerId, parent_id: parentId, trashed_at: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name_key: true },
  })
  return new Set(rows.map(row => row.name_key))
}

/** A folder of `ownerId` that things can go in, or null for the top level. */
export async function usableFolder(tx: Tx, ownerId: number, folderId: number | null): Promise<Item | null> {
  if (folderId === null) return null
  const folder = await tx.item.findFirst({ where: { id: folderId, owner_id: ownerId, kind: 'FOLDER', trashed_at: null } })
  if (!folder) throw new ApiError('folderNotFound', 404)
  return folder
}

export async function createFolder(ownerId: number, parentId: number | null, name: string): Promise<Item> {
  return withTree(ownerId, async tx => {
    await usableFolder(tx, ownerId, parentId)
    if ((await takenNames(tx, ownerId, parentId)).has(nameKey(name))) throw new ApiError('nameTaken', 409)
    return tx.item.create({ data: { owner_id: ownerId, parent_id: parentId, kind: 'FOLDER', name, name_key: nameKey(name) } })
  })
}

/**
 * The folder at `segments` under `parentId`, made where missing, like
 * `mkdir -p`. A file in the way gets a numbered folder beside it.
 */
export async function ensurePath(ownerId: number, parentId: number | null, segments: string[]): Promise<Item | null> {
  return withTree(ownerId, async tx => {
    let current = await usableFolder(tx, ownerId, parentId)
    for (const segment of segments) {
      const here = current?.id ?? null
      const existing = await tx.item.findFirst({
        where: { owner_id: ownerId, parent_id: here, name_key: nameKey(segment), kind: 'FOLDER', trashed_at: null },
      })
      if (existing) {
        current = existing
        continue
      }
      const name = freeName(segment, await takenNames(tx, ownerId, here), true)
      current = await tx.item.create({
        data: { owner_id: ownerId, parent_id: here, kind: 'FOLDER', name, name_key: nameKey(name) },
      })
    }
    return current
  })
}

/** Create a stored file's row in `parentId`, numbering its name when another item has it. */
export async function addFile(
  tx: Tx,
  file: { ownerId: number; parentId: number | null; name: string; size: number; mime: string; key: string },
): Promise<Item> {
  const parent = await tx.item.findFirst({
    where: { id: file.parentId ?? -1, owner_id: file.ownerId, kind: 'FOLDER', trashed_at: null },
  })
  if (file.parentId !== null && !parent) throw new ApiError('folderGone', 409)
  const name = freeName(file.name, await takenNames(tx, file.ownerId, file.parentId), false)
  return tx.item.create({
    data: {
      owner_id: file.ownerId,
      parent_id: file.parentId,
      kind: 'FILE',
      name,
      name_key: nameKey(name),
      size: BigInt(file.size),
      mime: file.mime,
      storage_key: file.key,
    },
  })
}

/**
 * Put new bytes in the file called `file.name` in `file.parentId`, keeping its
 * links and shares. The old version goes to the trash as a file of its own,
 * so it can be brought back. Null when there is no such file to replace.
 */
export async function replaceFile(
  tx: Tx,
  file: { ownerId: number; parentId: number | null; name: string; size: number; mime: string; key: string },
): Promise<Item | null> {
  const existing = await tx.item.findFirst({
    where: { owner_id: file.ownerId, parent_id: file.parentId, kind: 'FILE', name_key: nameKey(file.name), trashed_at: null },
  })
  if (!existing?.storage_key) return null
  const updated = await tx.item.update({
    where: { id: existing.id },
    data: {
      storage_key: file.key,
      size: BigInt(file.size),
      mime: file.mime,
      has_thumbnail: false,
      has_preview: false,
      thumbnail_tried: false,
      width: null,
      height: null,
    },
  })
  const old = await tx.item.create({
    data: {
      owner_id: existing.owner_id,
      parent_id: existing.parent_id,
      kind: 'FILE',
      name: existing.name,
      name_key: existing.name_key,
      size: existing.size,
      mime: existing.mime,
      storage_key: existing.storage_key,
      has_thumbnail: existing.has_thumbnail,
      has_preview: existing.has_preview,
      thumbnail_tried: existing.thumbnail_tried,
      width: existing.width,
      height: existing.height,
      created_at: existing.created_at,
    },
  })
  await tx.$executeRaw`
    UPDATE files_items SET trashed_at = now() AT TIME ZONE 'UTC', trash_root_id = ${old.id}, updated_at = now() AT TIME ZONE 'UTC'
    WHERE id = ${old.id}`
  return updated
}

/**
 * Which of `paths` ("Photos/2026/a.jpg"), under `parentId`, already hold a
 * file. A folder on the way that doesn't exist yet holds nothing.
 */
export async function existingFiles(ownerId: number, parentId: number | null, paths: string[][]): Promise<string[]> {
  await usableFolder(prisma, ownerId, parentId)
  const byDir = new Map<string, { segments: string[]; names: string[] }>()
  for (const path of paths) {
    const segments = path.slice(0, -1)
    const dir = segments.join('/')
    const entry = byDir.get(dir) ?? { segments, names: [] }
    entry.names.push(path[path.length - 1]!)
    byDir.set(dir, entry)
  }

  const folders = new Map<string, number | null | undefined>([['', parentId]])
  const folderAt = async (segments: string[]): Promise<number | null | undefined> => {
    const dir = segments.join('/')
    if (folders.has(dir)) return folders.get(dir)
    const above = await folderAt(segments.slice(0, -1))
    const found = above === undefined
      ? null
      : await prisma.item.findFirst({
          where: { owner_id: ownerId, parent_id: above, kind: 'FOLDER', name_key: nameKey(segments[segments.length - 1]!), trashed_at: null },
          select: { id: true },
        })
    const id = found ? found.id : undefined
    folders.set(dir, id)
    return id
  }

  const found: string[] = []
  for (const [dir, { segments, names }] of byDir) {
    const folderId = await folderAt(segments)
    if (folderId === undefined) continue
    const rows = await prisma.item.findMany({
      where: { owner_id: ownerId, parent_id: folderId, kind: 'FILE', trashed_at: null, name_key: { in: names.map(nameKey) } },
      select: { name_key: true },
    })
    const taken = new Set(rows.map(row => row.name_key))
    for (const name of names) if (taken.has(nameKey(name))) found.push(dir ? `${dir}/${name}` : name)
  }
  return found
}

export async function renameItem(ownerId: number, itemId: number, name: string): Promise<Item> {
  return withTree(ownerId, async tx => {
    const item = await tx.item.findFirst({ where: { id: itemId, owner_id: ownerId, trashed_at: null } })
    if (!item) throw new ApiError('notFound', 404)
    if (item.name === name) return item
    if ((await takenNames(tx, ownerId, item.parent_id, item.id)).has(nameKey(name))) throw new ApiError('nameTaken', 409)
    return tx.item.update({ where: { id: item.id }, data: { name, name_key: nameKey(name) } })
  })
}

/** The ids of a folder and everything above it. */
async function chainIds(tx: Tx | typeof prisma, itemId: number): Promise<number[]> {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS depth FROM files_items WHERE id = ${itemId}
      UNION ALL
      SELECT i.id, i.parent_id, c.depth + 1 FROM files_items i JOIN chain c ON i.id = c.parent_id
    )
    SELECT id FROM chain ORDER BY depth`
  return rows.map(row => row.id)
}

export async function moveItems(ownerId: number, ids: number[], targetId: number | null): Promise<Item[]> {
  return withTree(ownerId, async tx => {
    await usableFolder(tx, ownerId, targetId)
    const above = new Set(targetId === null ? [] : await chainIds(tx, targetId))
    const taken = await takenNames(tx, ownerId, targetId)
    const moved: Item[] = []
    for (const id of ids) {
      const item = await tx.item.findFirst({ where: { id, owner_id: ownerId, trashed_at: null } })
      if (!item) throw new ApiError('notFound', 404)
      if (above.has(item.id)) throw new ApiError('cannotMoveIntoItself', 409)
      if (item.parent_id === targetId) continue
      const name = freeName(item.name, taken, item.kind === 'FOLDER')
      taken.add(nameKey(name))
      moved.push(await tx.item.update({ where: { id: item.id }, data: { parent_id: targetId, name, name_key: nameKey(name) } }))
    }
    return moved
  })
}

/**
 * Put items in the trash. Everything inside a folder goes with it, marked
 * with the folder's id so restoring it brings back exactly that.
 */
export async function trashItems(ownerId: number, ids: number[]): Promise<number> {
  return withTree(ownerId, async tx => {
    let count = 0
    for (const id of ids) {
      const item = await tx.item.findFirst({ where: { id, owner_id: ownerId, trashed_at: null } })
      if (!item) continue
      // Prisma keeps timestamps as UTC without a zone; this matches it whatever the server's zone is.
      await tx.$executeRaw`
        WITH RECURSIVE sub AS (
          SELECT id FROM files_items WHERE id = ${id}
          UNION ALL
          SELECT i.id FROM files_items i JOIN sub s ON i.parent_id = s.id WHERE i.trashed_at IS NULL
        )
        UPDATE files_items
        SET trashed_at = now() AT TIME ZONE 'UTC', trash_root_id = ${id}, updated_at = now() AT TIME ZONE 'UTC'
        WHERE id IN (SELECT id FROM sub) AND trashed_at IS NULL`
      count += 1
    }
    return count
  })
}

async function trashRoot(tx: Tx, ownerId: number, id: number): Promise<Item> {
  const item = await tx.item.findFirst({ where: { id, owner_id: ownerId, trash_root_id: id, NOT: { trashed_at: null } } })
  if (!item) throw new ApiError('notFound', 404)
  return item
}

/** Take something out of the trash, back where it was, or to the top when that folder is gone. */
export async function restoreItem(ownerId: number, id: number): Promise<Item> {
  return withTree(ownerId, async tx => {
    const item = await trashRoot(tx, ownerId, id)
    const parent = item.parent_id === null
      ? null
      : await tx.item.findFirst({ where: { id: item.parent_id, trashed_at: null } })
    const parentId = parent?.id ?? null
    const name = freeName(item.name, await takenNames(tx, ownerId, parentId), item.kind === 'FOLDER')
    await tx.item.updateMany({ where: { trash_root_id: id }, data: { trashed_at: null, trash_root_id: null } })
    return tx.item.update({ where: { id }, data: { parent_id: parentId, name, name_key: nameKey(name) } })
  })
}

/** Delete something in the trash for good: its rows, then its bytes. */
export async function deleteForever(ownerId: number, id: number): Promise<void> {
  const keys = await withTree(ownerId, async tx => {
    await trashRoot(tx, ownerId, id)
    // Things deleted on their own earlier, inside this folder, stay in the
    // trash: they are moved out of the way of the cascade.
    await tx.$executeRaw`
      WITH RECURSIVE sub AS (
        SELECT id FROM files_items WHERE id = ${id}
        UNION ALL
        SELECT i.id FROM files_items i JOIN sub s ON i.parent_id = s.id
      )
      UPDATE files_items SET parent_id = NULL
      WHERE id IN (SELECT id FROM sub) AND id <> ${id} AND trash_root_id = id`
    const files = await tx.item.findMany({
      where: { trash_root_id: id, kind: 'FILE', NOT: { storage_key: null } },
      select: { storage_key: true },
    })
    await tx.item.delete({ where: { id } })
    return files.map(file => file.storage_key!)
  })
  for (const key of keys) await removeStored(key).catch(() => {})
}

export async function emptyTrash(ownerId: number): Promise<void> {
  const roots = await prisma.item.findMany({
    where: { owner_id: ownerId, NOT: { trashed_at: null } },
    select: { id: true, trash_root_id: true },
  })
  for (const root of roots) {
    if (root.trash_root_id === root.id) await deleteForever(ownerId, root.id)
  }
}

/** Empty everyone's trash of what has been there longer than TRASH_DAYS. */
export async function purgeTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000)
  const roots = await prisma.item.findMany({
    where: { trashed_at: { lt: cutoff } },
    select: { id: true, owner_id: true, trash_root_id: true },
  })
  let removed = 0
  for (const root of roots) {
    if (root.trash_root_id !== root.id) continue
    await deleteForever(root.owner_id, root.id).catch(error => console.error('Purging the trash failed:', error))
    removed += 1
  }
  return removed
}

/** From the top down to `itemId`, or from `fromId` when given (a shared folder's own top). */
export async function crumbsOf(itemId: number, fromId?: number | null): Promise<Crumb[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, name, 0 AS depth FROM files_items WHERE id = ${itemId}
      UNION ALL
      SELECT i.id, i.parent_id, i.name, c.depth + 1 FROM files_items i JOIN chain c ON i.id = c.parent_id
    )
    SELECT id, name FROM chain ORDER BY depth DESC`
  const start = fromId ? rows.findIndex(row => row.id === fromId) : 0
  // Never show a viewer the owner's folders above what was shared.
  const visible = start === -1 ? rows.slice(-1) : rows.slice(start)
  return visible.map(row => ({ id: row.id, name: row.name }))
}

export interface Access {
  item: Item
  role: 'owner' | 'viewer'
  /** For a viewer: the folder or file that was shared with them. */
  shareRootId: number | null
}

/** Whether `userId` may see `itemId`: as its owner, or because it or a folder above it was shared with them. */
export async function accessTo(userId: number, itemId: number): Promise<Access | null> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item || item.trashed_at) return null
  if (item.owner_id === userId) return { item, role: 'owner', shareRootId: null }
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS depth FROM files_items WHERE id = ${itemId}
      UNION ALL
      SELECT i.id, i.parent_id, c.depth + 1 FROM files_items i JOIN chain c ON i.id = c.parent_id
    )
    SELECT c.id FROM chain c JOIN files_shares s ON s.item_id = c.id AND s.user_id = ${userId}
    ORDER BY c.depth LIMIT 1`
  return rows.length > 0 ? { item, role: 'viewer', shareRootId: rows[0]!.id } : null
}

export async function ownedItem(userId: number, itemId: number | null): Promise<Item> {
  const access = itemId === null ? null : await accessTo(userId, itemId)
  if (!access || access.role !== 'owner') throw new ApiError('notFound', 404)
  return access.item
}

export async function visibleItem(userId: number, itemId: number | null): Promise<Access> {
  const access = itemId === null ? null : await accessTo(userId, itemId)
  if (!access) throw new ApiError('notFound', 404)
  return access
}

/** Everything in a folder and the folders inside it, in bytes. The trash doesn't count. */
export async function folderSize(db: Tx | typeof prisma, folderId: number): Promise<number> {
  const [row] = await db.$queryRaw<Array<{ total: bigint | null }>>`
    WITH RECURSIVE tree AS (
      SELECT id FROM files_items WHERE id = ${folderId}
      UNION ALL
      SELECT i.id FROM files_items i JOIN tree t ON i.parent_id = t.id WHERE i.trashed_at IS NULL
    )
    SELECT SUM(size) AS total FROM files_items
    WHERE id IN (SELECT id FROM tree) AND kind = 'FILE' AND trashed_at IS NULL`
  return Number(row?.total ?? 0)
}

/** Whether `itemId` is `rootId` or inside it. */
export async function isWithin(rootId: number, itemId: number): Promise<boolean> {
  if (rootId === itemId) return true
  return (await chainIds(prisma, itemId)).includes(rootId)
}

async function childCounts(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.item.groupBy({
    by: ['parent_id'],
    where: { parent_id: { in: ids }, trashed_at: null },
    _count: { _all: true },
  })
  return new Map(rows.map(row => [row.parent_id!, row._count._all]))
}

type Sharing = Pick<ItemDto, 'link' | 'people' | 'uploadLink'>

async function sharing(ids: number[]): Promise<Map<number, Sharing>> {
  const result = new Map<number, Sharing>()
  if (ids.length === 0) return result
  const [links, uploadLinks, shares] = await Promise.all([
    prisma.shareLink.findMany({ where: { item_id: { in: ids } }, select: { item_id: true, access: true } }),
    prisma.uploadLink.findMany({ where: { folder_id: { in: ids } }, select: { folder_id: true } }),
    prisma.share.groupBy({ by: ['item_id'], where: { item_id: { in: ids } }, _count: { _all: true } }),
  ])
  for (const id of ids) result.set(id, { link: null, people: 0, uploadLink: false })
  for (const link of links) result.get(link.item_id)!.link = link.access === 'PUBLIC' ? 'public' : 'users'
  for (const link of uploadLinks) result.get(link.folder_id)!.uploadLink = true
  for (const share of shares) result.get(share.item_id)!.people = share._count._all
  return result
}

async function starred(userId: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.favorite.findMany({ where: { user_id: userId, item_id: { in: ids } }, select: { item_id: true } })
  return new Set(rows.map(row => row.item_id))
}

/**
 * Items as a listing shows them: with what folders hold and, for their
 * owner, how they are shared. Given who is looking, also which they starred.
 */
export async function describe(items: Item[], forOwner: boolean, viewerId?: number): Promise<ItemDto[]> {
  const ids = items.map(item => item.id)
  const folders = items.filter(item => item.kind === 'FOLDER').map(item => item.id)
  const [counts, shared, favorites] = await Promise.all([
    childCounts(folders),
    forOwner ? sharing(ids) : Promise.resolve(null),
    viewerId === undefined ? Promise.resolve(null) : starred(viewerId, ids),
  ])
  return items.map(item =>
    toItemDto(item, {
      ...(item.kind === 'FOLDER' ? { childCount: counts.get(item.id) ?? 0 } : {}),
      ...(shared ? shared.get(item.id) : {}),
      ...(favorites ? { favorite: favorites.has(item.id) } : {}),
    }),
  )
}

export async function listFolder(user: Pick<User, 'id'>, folderId: number | null): Promise<FolderListing> {
  if (folderId === null) {
    const items = await prisma.item.findMany({ where: { owner_id: user.id, parent_id: null, trashed_at: null } })
    return { folder: null, crumbs: [], role: 'owner', owner: null, items: await describe(items, true, user.id) }
  }
  const access = await accessTo(user.id, folderId)
  if (!access || access.item.kind !== 'FOLDER') throw new ApiError('notFound', 404)
  const items = await prisma.item.findMany({ where: { parent_id: folderId, trashed_at: null } })
  const owner = access.role === 'viewer'
    ? await prisma.user.findUnique({ where: { id: access.item.owner_id } })
    : null
  const [folder] = await describe([access.item], access.role === 'owner', user.id)
  return {
    folder: folder!,
    crumbs: await crumbsOf(folderId, access.shareRootId),
    role: access.role,
    owner: owner ? toPerson(owner) : null,
    items: await describe(items, access.role === 'owner', user.id),
  }
}

/** "Documents / Taxes" for something inside those folders, "" at the top. */
export async function locationOf(item: Pick<Item, 'parent_id'>): Promise<string> {
  if (item.parent_id === null) return ''
  return (await crumbsOf(item.parent_id)).map(crumb => crumb.name).join(' / ')
}

export async function searchItems(ownerId: number, query: string): Promise<SearchResult[]> {
  const items = await prisma.item.findMany({
    where: { owner_id: ownerId, trashed_at: null, name: { contains: escapeLike(query), mode: 'insensitive' } },
    orderBy: [{ kind: 'asc' }, { updated_at: 'desc' }],
    take: 100,
  })
  const described = await describe(items, true, ownerId)
  return Promise.all(described.map(async (dto, index) => ({ item: dto, location: await locationOf(items[index]!) })))
}

export async function listTrash(ownerId: number): Promise<TrashEntry[]> {
  const roots = (await prisma.item.findMany({
    where: { owner_id: ownerId, NOT: { trashed_at: null } },
    orderBy: { trashed_at: 'desc' },
  })).filter(item => item.trash_root_id === item.id)
  if (roots.length === 0) return []

  const sizes = await prisma.item.groupBy({
    by: ['trash_root_id'],
    where: { trash_root_id: { in: roots.map(root => root.id) }, kind: 'FILE' },
    _sum: { size: true },
  })
  const sizeOf = new Map(sizes.map(row => [row.trash_root_id!, Number(row._sum.size ?? 0)]))
  const parentIds = [...new Set(roots.map(root => root.parent_id).filter((id): id is number => id !== null))]
  const parents = new Map(
    (await prisma.item.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } }))
      .map(parent => [parent.id, parent.name]),
  )

  return roots.map(root => ({
    item: toItemDto(root),
    deletedAt: root.trashed_at!.toISOString(),
    from: root.parent_id === null ? null : parents.get(root.parent_id) ?? null,
    size: sizeOf.get(root.id) ?? 0,
  }))
}

export interface TreeEntry {
  id: number
  kind: 'FOLDER' | 'FILE'
  size: bigint
  storage_key: string | null
  updated_at: Date
  /** Relative to the top of the tree, which is its own name. */
  path: string
}

/** A folder and everything in it, for a zip. */
export async function treeOf(rootId: number): Promise<TreeEntry[]> {
  return prisma.$queryRaw<TreeEntry[]>`
    WITH RECURSIVE tree AS (
      SELECT id, kind::text AS kind, size, storage_key, updated_at, name::text AS path FROM files_items WHERE id = ${rootId}
      UNION ALL
      SELECT i.id, i.kind::text, i.size, i.storage_key, i.updated_at, t.path || '/' || i.name
      FROM files_items i JOIN tree t ON i.parent_id = t.id
      WHERE i.trashed_at IS NULL
    )
    SELECT id, kind, size, storage_key, updated_at, path FROM tree ORDER BY path`
}
