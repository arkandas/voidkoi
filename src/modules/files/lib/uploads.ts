import { stat } from 'node:fs/promises'
import type { Item, Upload, User } from '@/generated/prisma/client'
import type { UploadSession } from '@/modules/files/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { newKey } from '@/lib/ids'
import { isEditable } from '@/lib/file-types'
import { addFile, folderSize, isWithin, ownedItem, replaceFile, usableFolder, withTree } from '@/modules/files/lib/items'
import { prisma, type Tx } from '@/lib/prisma'
import { checkRoom, getSettings } from '@/modules/files/lib/settings'
import {
  ChunkTooLongError,
  createIncoming,
  incomingSize,
  listKeys,
  promote,
  removeIncoming,
  removeStored,
  storagePath,
  writeAt,
} from '@/lib/storage'

/** Uploads go up in pieces of this size, a few at a time. */
export const CHUNK_SIZE = 8 * 1024 * 1024

/** Files up to this size go up in a single request. */
export const DIRECT_MAX = CHUNK_SIZE

/** An upload nobody has touched for this long is abandoned. */
const ABANDONED_MS = 24 * 60 * 60 * 1000

export function chunkCount(size: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(size / chunkSize))
}

export function chunkLength(size: number, chunkSize: number, index: number): number {
  return Math.max(0, Math.min(chunkSize, size - index * chunkSize))
}

export interface NewFile {
  name: string
  size: number
  mime: string
  parentId: number | null
  /** A file with the same name in the folder gets these bytes, instead of this one getting a numbered name. */
  replace?: boolean
}

/**
 * An upload through an upload link. `user` is then the folder's owner: the
 * file is theirs and counts toward their storage. It can only go in the
 * link's folder or a folder inside it, and never replaces anything.
 */
export interface ViaLink {
  id: number
  folderId: number
}

export function toSession(upload: Upload): UploadSession {
  return { id: upload.id, chunkSize: upload.chunk_size, received: [...new Set(upload.received)].sort((a, b) => a - b) }
}

/** The folder a file goes in: as asked, or, through a link, the link's folder when none is given. */
export async function destination(db: Tx, ownerId: number, parentId: number | null, via?: ViaLink): Promise<number | null> {
  const folderId = via ? parentId ?? via.folderId : parentId
  await usableFolder(db, ownerId, folderId)
  if (via && !(await isWithin(via.folderId, folderId!))) throw new ApiError('folderNotFound', 404)
  return folderId
}

/**
 * Refuse a file through an upload link that would take the link's folder over
 * the administrator's limit. What is in the folder counts, whoever put it
 * there, and so do uploads through the link still arriving.
 */
async function checkFolderRoom(db: Tx, via: ViaLink | undefined, size: number): Promise<void> {
  if (!via) return
  const { uploadLinkMaxBytes } = await getSettings(db)
  if (uploadLinkMaxBytes === null) return
  const { _sum } = await db.upload.aggregate({ where: { upload_link_id: via.id }, _sum: { size: true } })
  const used = (await folderSize(db, via.folderId)) + Number(_sum.size ?? 0)
  if (used + size > uploadLinkMaxBytes) throw new ApiError('folderFull', 413)
}

export async function startUpload(user: User, file: NewFile, via?: ViaLink): Promise<Upload> {
  const id = newKey()
  const upload = await withTree(user.id, async tx => {
    const parentId = await destination(tx, user.id, file.parentId, via)
    await checkRoom(user, file.size, { db: tx })
    await checkFolderRoom(tx, via, file.size)
    return tx.upload.create({
      data: {
        id,
        owner_id: user.id,
        parent_id: parentId,
        name: file.name,
        size: BigInt(file.size),
        mime: file.mime,
        chunk_size: CHUNK_SIZE,
        replace: !via && (file.replace ?? false),
        upload_link_id: via?.id ?? null,
      },
    })
  })
  await createIncoming(id)
  return upload
}

/** An upload in progress, for whoever started it: the owner in the app, or the link it came through. */
async function findUpload(user: User, uploadId: string, via?: ViaLink): Promise<Upload> {
  const upload = await prisma.upload.findFirst({ where: { id: uploadId, owner_id: user.id, upload_link_id: via?.id ?? null } })
  if (!upload) throw new ApiError('uploadNotFound', 404)
  return upload
}

export async function uploadStatus(user: User, uploadId: string, via?: ViaLink): Promise<UploadSession> {
  return toSession(await findUpload(user, uploadId, via))
}

export async function receiveChunk(
  user: User,
  uploadId: string,
  index: number,
  body: ReadableStream<Uint8Array> | null,
  via?: ViaLink,
): Promise<void> {
  const upload = await findUpload(user, uploadId, via)
  const size = Number(upload.size)
  if (!Number.isInteger(index) || index < 0 || index >= chunkCount(size, upload.chunk_size)) {
    throw new ApiError('chunkInvalid', 400)
  }
  // A piece that already arrived is never written again: a retry whose answer
  // got lost carries the same bytes, and a bad one must not spoil good ones.
  if (upload.received.includes(index)) {
    await body?.cancel().catch(() => {})
    return
  }
  const expected = chunkLength(size, upload.chunk_size, index)
  let written = 0
  try {
    written = body ? await writeAt(uploadId, index * upload.chunk_size, body, expected) : 0
  } catch (error) {
    if (error instanceof ChunkTooLongError) throw new ApiError('chunkInvalid', 400)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError('uploadNotFound', 404)
    throw error
  }
  if (written !== expected) throw new ApiError('chunkInvalid', 400)
  await prisma.$executeRaw`
    UPDATE files_uploads
    SET received = array_append(received, ${index}::int), updated_at = now() AT TIME ZONE 'UTC'
    WHERE id = ${uploadId} AND NOT (${index}::int = ANY(received))`
}

/**
 * Move a fully arrived file into place and give it its row. On any failure
 * the bytes go, so a file never sits on disk without a row.
 */
async function finish(
  user: User,
  incomingId: string,
  file: NewFile,
  inTransaction?: (tx: Tx) => Promise<unknown>,
): Promise<Item> {
  const key = newKey()
  await promote(incomingId, key)
  try {
    return await withTree(user.id, async tx => {
      const stored = { ownerId: user.id, parentId: file.parentId, name: file.name, size: file.size, mime: file.mime, key }
      const item = (file.replace ? await replaceFile(tx, stored) : null) ?? (await addFile(tx, stored))
      if (inTransaction) await inTransaction(tx)
      return item
    })
  } catch (error) {
    await removeStored(key).catch(() => {})
    throw error
  }
}

/**
 * A file through an upload link is in its folder. Check the limit again, now
 * under the owner's lock and with the file counted, so files arriving side by
 * side can't pass it together. Then count the file.
 */
async function arrivedThroughLink(tx: Tx, via: ViaLink | undefined): Promise<void> {
  if (!via) return
  await checkFolderRoom(tx, via, 0)
  await tx.uploadLink.updateMany({ where: { id: via.id }, data: { received_count: { increment: 1 } } })
}

export async function completeUpload(user: User, uploadId: string, via?: ViaLink): Promise<Item> {
  const upload = await findUpload(user, uploadId, via)
  const size = Number(upload.size)
  const received = new Set(upload.received)
  for (let index = 0; index < chunkCount(size, upload.chunk_size); index++) {
    if (!received.has(index)) throw new ApiError('uploadIncomplete', 409)
  }
  if ((await incomingSize(uploadId)) !== size) throw new ApiError('uploadIncomplete', 409)

  const file = { name: upload.name, size, mime: upload.mime, parentId: upload.parent_id, replace: upload.replace }
  try {
    return await finish(user, uploadId, file, async tx => {
      await tx.upload.delete({ where: { id: uploadId } })
      await arrivedThroughLink(tx, via)
    })
  } catch (error) {
    // The folder went while it was arriving, or filled up: nothing is left to finish.
    if (error instanceof ApiError && (error.code === 'folderGone' || error.code === 'folderFull')) {
      await prisma.upload.deleteMany({ where: { id: uploadId } })
    }
    throw error
  }
}

export async function cancelUpload(user: User, uploadId: string, via?: ViaLink): Promise<void> {
  const { count } = await prisma.upload.deleteMany({ where: { id: uploadId, owner_id: user.id, upload_link_id: via?.id ?? null } })
  if (count === 0) throw new ApiError('uploadNotFound', 404)
  await removeIncoming(uploadId)
}

/** A small file in one request: checked, written and stored. */
export async function directUpload(
  user: User,
  file: NewFile,
  body: ReadableStream<Uint8Array> | null,
  via?: ViaLink,
): Promise<Item> {
  const parentId = await destination(prisma, user.id, file.parentId, via)
  await checkRoom(user, file.size)
  await checkFolderRoom(prisma, via, file.size)
  const id = newKey()
  await createIncoming(id)
  try {
    const written = body ? await writeAt(id, 0, body, file.size) : 0
    if (written !== file.size) throw new ApiError('chunkInvalid', 400)
  } catch (error) {
    await removeIncoming(id)
    if (error instanceof ChunkTooLongError) throw new ApiError('chunkInvalid', 400)
    throw error
  }
  // Nothing was set aside for it while it arrived: check the owner's storage
  // again under their lock, with the file counted, so files sent side by side
  // can't pass the limit together.
  return finish(user, id, { ...file, parentId, replace: !via && file.replace }, async tx => {
    await checkRoom(user, 0, { db: tx })
    await arrivedThroughLink(tx, via)
  })
}

/** A file's version, as its ETag: the storage key changes whenever its bytes do. */
export function versionOf(item: Pick<Item, 'storage_key'>): string {
  return `"${item.storage_key}"`
}

/**
 * Save new contents of a text file edited in the app: the same item, with its
 * links and shares, and new bytes. `ifMatch` is the version the editor opened;
 * when the file changed since, nothing is written.
 */
export async function saveText(
  user: User,
  itemId: number | null,
  ifMatch: string | null,
  size: number,
  body: ReadableStream<Uint8Array> | null,
): Promise<Item> {
  const item = await ownedItem(user.id, itemId)
  if (item.kind !== 'FILE' || !item.storage_key || !isEditable(item.mime, item.name, Number(item.size))) {
    throw new ApiError('notEditable', 400)
  }
  if (ifMatch !== null && ifMatch !== versionOf(item)) throw new ApiError('editConflict', 412)
  await checkRoom(user, size, { frees: Number(item.size) })

  const incoming = newKey()
  await createIncoming(incoming)
  try {
    const written = body ? await writeAt(incoming, 0, body, size) : 0
    if (written !== size) throw new ApiError('chunkInvalid', 400)
  } catch (error) {
    await removeIncoming(incoming)
    if (error instanceof ChunkTooLongError) throw new ApiError('chunkInvalid', 400)
    throw error
  }

  const oldKey = item.storage_key
  const key = newKey()
  await promote(incoming, key)
  try {
    const saved = await withTree(user.id, async tx => {
      const { count } = await tx.item.updateMany({
        where: { id: item.id, storage_key: oldKey, trashed_at: null },
        data: {
          storage_key: key,
          size: BigInt(size),
          has_thumbnail: false,
          has_preview: false,
          thumbnail_tried: false,
          width: null,
          height: null,
        },
      })
      if (count === 0) throw new ApiError('editConflict', 412)
      return tx.item.findUniqueOrThrow({ where: { id: item.id } })
    })
    await removeStored(oldKey).catch(() => {})
    return saved
  } catch (error) {
    await removeStored(key).catch(() => {})
    throw error
  }
}

/**
 * Drop uploads nobody finished, and incoming files nothing knows about.
 * A file younger than an hour may still be a small upload arriving.
 */
export async function sweepUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDONED_MS)
  const stale = await prisma.upload.findMany({ where: { updated_at: { lt: cutoff } }, select: { id: true } })
  for (const { id } of stale) {
    await prisma.upload.deleteMany({ where: { id } })
    await removeIncoming(id)
  }

  const known = new Set((await prisma.upload.findMany({ select: { id: true } })).map(upload => upload.id))
  const hourAgo = Date.now() - 60 * 60 * 1000
  for (const id of await listKeys('incoming')) {
    if (known.has(id)) continue
    const modified = await stat(storagePath('incoming', id)).then(info => info.mtimeMs).catch(() => 0)
    if (modified < hourAgo) await removeIncoming(id)
  }
  return stale.length
}
