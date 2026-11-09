import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** The rows the thumbnails read, and what they write back. */
const db = vi.hoisted(() => ({
  items: new Map<number, { id: number; name: string; mime: string; storage_key: string }>(),
  updates: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    item: {
      findUnique: async ({ where }: { where: { id: number } }) => db.items.get(where.id) ?? null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        db.updates.push(data)
        return { count: 1 }
      },
    },
  },
}))

// Stored files and thumbnails go in a folder of this test's own: storage reads where when it loads.
const previousDataDir = process.env.VOIDKOI_DATA_DIR
const dataDir = mkdtempSync(join(tmpdir(), 'files-thumbnails-'))
process.env.VOIDKOI_DATA_DIR = dataDir

const { makeThumbnail } = await import('./thumbnails')
const { storagePath, writeStored } = await import('@/lib/storage')
const { newKey } = await import('@/lib/ids')

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.VOIDKOI_DATA_DIR
  else process.env.VOIDKOI_DATA_DIR = previousDataDir
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  db.updates = []
})

let nextId = 1

async function stored(name: string, mime: string, bytes: Uint8Array): Promise<{ id: number; key: string }> {
  const key = newKey()
  await writeStored('files', key, bytes)
  const id = nextId++
  db.items.set(id, { id, name, mime, storage_key: key })
  return { id, key }
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f00"/></svg>',
)

/** A PNG whose header says it is `width` by `height`, with hardly any picture behind it. */
function claimedPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const framed = Buffer.alloc(body.length + 8)
    framed.writeUInt32BE(data.length, 0)
    body.copy(framed, 4)
    framed.writeUInt32BE(crc32(body), body.length + 4)
    return framed
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(2, 9)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function book(cover: string, type: string, bytes: Uint8Array): Uint8Array {
  return zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
    'content.opf': strToU8(`<manifest><item id="c" properties="cover-image" href="${cover}" media-type="${type}"/></manifest>`),
    [cover]: bytes,
  })
}

describe('makeThumbnail', () => {
  it('makes a thumbnail of a picture, and notes its size', async () => {
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0a0' } }).png().toBuffer()
    const { id, key } = await stored('photo.png', 'image/png', png)
    expect(await makeThumbnail(id)).toBe(true)
    expect(existsSync(storagePath('thumbs', key))).toBe(true)
    expect(db.updates).toEqual([expect.objectContaining({ has_thumbnail: true, width: 64, height: 48 })])
  })

  it('never draws an SVG called something else', async () => {
    const { id, key } = await stored('photo.png', 'image/png', SVG)
    expect(await makeThumbnail(id)).toBe(false)
    expect(existsSync(storagePath('thumbs', key))).toBe(false)
    expect(db.updates).toEqual([{ thumbnail_tried: true }])
  })

  it('never draws an SVG cover of a book', async () => {
    const { id, key } = await stored('novel.epub', 'application/epub+zip', book('cover.svg', 'image/svg+xml', SVG))
    expect(await makeThumbnail(id)).toBe(false)
    expect(existsSync(storagePath('thumbs', key))).toBe(false)
  })

  it('reads the cover of a book when it is a picture', async () => {
    const png = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#00a' } }).png().toBuffer()
    const { id } = await stored('novel.epub', 'application/epub+zip', book('cover.png', 'image/png', png))
    expect(await makeThumbnail(id)).toBe(true)
  })

  it('does not read a picture that claims too many pixels', async () => {
    // 225 million: under sharp's own limit, over the one for Files.
    const { id, key } = await stored('huge.png', 'image/png', claimedPng(15_000, 15_000))
    await expect(makeThumbnail(id)).rejects.toThrow(/pixel limit/)
    expect(existsSync(storagePath('thumbs', key))).toBe(false)
    expect(db.updates).toEqual([{ thumbnail_tried: true }])
  })

  it('still draws the first lines of a text file', async () => {
    const { id, key } = await stored('notes.md', 'text/markdown', strToU8('# Notes\n\n- one\n- two\n'))
    expect(await makeThumbnail(id)).toBe(true)
    expect(existsSync(storagePath('thumbs', key))).toBe(true)
  })
})
