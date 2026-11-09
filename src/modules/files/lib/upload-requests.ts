import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/error-codes'
import { typeFor } from '@/lib/file-types'
import { cleanName } from '@/modules/files/lib/names'
import { readJson } from '@/lib/request'
import { DIRECT_MAX, type NewFile } from '@/modules/files/lib/uploads'
import { parseFolderId } from '@/lib/validate'

/** The file a chunked upload is for, from `{ name, size, type, parentId, replace }`. */
export async function readNewUpload(request: NextRequest): Promise<NewFile> {
  const body = await readJson(request)
  const name = cleanName(body?.name)
  const size = body?.size
  const parentId = parseFolderId(body?.parentId)
  if (!name) throw new ApiError('invalidName', 400)
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) throw new ApiError('invalidInput', 400)
  if (parentId === undefined) throw new ApiError('folderNotFound', 404)
  return { name, size, mime: typeFor(name, body?.type), parentId, replace: body?.replace === true }
}

/**
 * A small file sent in one request: the body is the file itself, and its
 * name, type, folder and whether it replaces a file of the same name come
 * in headers.
 */
export function directFile(request: NextRequest): NewFile {
  const header = (name: string) => request.headers.get(name) ?? ''
  let rawName = header('x-file-name')
  try {
    rawName = decodeURIComponent(rawName)
  } catch {}
  const name = cleanName(rawName)
  const size = Number(header('content-length'))
  const parentId = parseFolderId(header('x-parent-id'))
  if (!name) throw new ApiError('invalidName', 400)
  if (!Number.isSafeInteger(size) || size < 0 || size > DIRECT_MAX) throw new ApiError('invalidInput', 400)
  if (parentId === undefined) throw new ApiError('folderNotFound', 404)
  return { name, size, mime: typeFor(name, header('x-file-type')), parentId, replace: header('x-replace') === '1' }
}

/** A chunk's place in its upload, from the address: a whole number. */
export function chunkIndex(raw: string): number {
  if (!/^\d{1,7}$/.test(raw)) throw new ApiError('chunkInvalid', 400)
  return Number(raw)
}
