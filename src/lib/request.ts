import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { NextRequest } from 'next/server'

/** A body larger than the route takes. */
export class BodyTooLarge extends Error {
  constructor() {
    super('The request body is too large')
  }
}

/** JSON bodies are small unless a route says otherwise: settings, names, messages. */
const JSON_LIMIT = 1024 * 1024

function declaredLength(request: Request): number | null {
  const header = request.headers.get('content-length')
  if (header === null) return null
  const length = Number(header)
  return Number.isSafeInteger(length) && length >= 0 ? length : null
}

/**
 * The body's bytes, never more than `maxBytes`: a declared length over it is
 * refused before anything is read, and a body without one is counted as it
 * arrives. Throws BodyTooLarge.
 */
export async function readBody(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = declaredLength(request)
  if (declared !== null && declared > maxBytes) throw new BodyTooLarge()
  if (!request.body) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyTooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks, size)
}

/** The JSON object a request sends. Null when it sends anything else, or more than `maxBytes` (1 MB unless said). */
export async function readJson(request: NextRequest | Request, maxBytes = JSON_LIMIT): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = JSON.parse((await readBody(request, maxBytes)).toString('utf8'))
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The body written to a new file at `path` as it arrives, so a large upload
 * never sits in memory. Past `maxBytes` it stops and the partial file is
 * removed. Returns the size written. Throws BodyTooLarge.
 */
export async function saveBody(request: Request, path: string, maxBytes: number): Promise<number> {
  const declared = declaredLength(request)
  if (declared !== null && declared > maxBytes) throw new BodyTooLarge()
  let size = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length
      if (size > maxBytes) done(new BodyTooLarge())
      else done(null, chunk)
    },
  })
  // Only a file this call made is removed: 'wx' fails on one that is already there.
  let created = false
  const file = createWriteStream(path, { flags: 'wx' }).once('open', () => {
    created = true
  })
  try {
    const source = request.body ? Readable.fromWeb(request.body as import('node:stream/web').ReadableStream) : Readable.from([])
    await pipeline(source, counter, file)
    return size
  } catch (error) {
    if (created) await rm(path, { force: true })
    throw error
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002'
}
