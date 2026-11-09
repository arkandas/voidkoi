import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Item } from '@/generated/prisma/client'
import type { LinkWithItem } from '@/modules/files/lib/shares'

/** The link the routes find, counted the way the database counts it, and what its zip holds. */
const state = vi.hoisted(() => ({ link: null as LinkWithItem | null, entries: [] as unknown[] }))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/session', () => ({ currentUser: async () => null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/modules/files/lib/items', () => ({ isWithin: async () => false }))
vi.mock('@/modules/files/lib/shares', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/files/lib/shares')>()),
  findLink: async (token: string) => (state.link?.token === token ? state.link : null),
  countDownload: async (linkId: number) => {
    const link = state.link
    if (!link || link.id !== linkId) return false
    if (link.max_downloads !== null && link.download_count >= link.max_downloads) return false
    link.download_count += 1
    return true
  },
}))
vi.mock('@/modules/files/lib/zip', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/files/lib/zip')>()),
  zipEntries: async () => state.entries,
}))

// Stored files go in a folder of this test's own: storage reads where when it loads.
const previousDataDir = process.env.VOIDKOI_DATA_DIR
const dataDir = mkdtempSync(join(tmpdir(), 'files-link-downloads-'))
process.env.VOIDKOI_DATA_DIR = dataDir

const { GET: contentRoute } = await import('@/app/api/files/s/[token]/items/[id]/content/route')
const { GET: zipRoute } = await import('@/app/api/files/s/[token]/zip/route')
const { writeStored } = await import('@/lib/storage')
const { newKey } = await import('@/lib/ids')

afterAll(() => {
  if (previousDataDir === undefined) delete process.env.VOIDKOI_DATA_DIR
  else process.env.VOIDKOI_DATA_DIR = previousDataDir
  rmSync(dataDir, { recursive: true, force: true })
})

const TOKEN = 'L'.repeat(24)
const BYTES = Buffer.from('0123456789 the whole file, from its first byte')
let nextId = 1

async function stored(name: string, mime: string): Promise<Item> {
  const key = newKey()
  await writeStored('files', key, BYTES)
  return thing({ name, mime, kind: 'FILE', storage_key: key, size: BigInt(BYTES.length) })
}

function thing(fields: Partial<Item>): Item {
  const now = new Date()
  return {
    id: nextId++,
    owner_id: 1,
    parent_id: null,
    kind: 'FILE',
    name: 'file',
    name_key: 'file',
    size: BigInt(0),
    mime: null,
    storage_key: null,
    has_thumbnail: false,
    has_preview: false,
    thumbnail_tried: false,
    width: null,
    height: null,
    trashed_at: null,
    trash_root_id: null,
    created_at: now,
    updated_at: now,
    ...fields,
  }
}

/** A public link to `item` with a download limit, as the routes will find it. */
function share(item: Item, maxDownloads: number | null): LinkWithItem {
  const now = new Date()
  state.link = {
    id: 7,
    token: TOKEN,
    item_id: item.id,
    owner_id: 1,
    access: 'PUBLIC',
    password_hash: null,
    expires_at: null,
    max_downloads: maxDownloads,
    download_count: 0,
    created_at: now,
    updated_at: now,
    item,
    owner: { id: 1, username: 'owner' } as LinkWithItem['owner'],
  }
  return state.link
}

async function getFile(item: Item, { download = false, range }: { download?: boolean; range?: string } = {}) {
  const request = new NextRequest(`http://localhost/api/files/s/${TOKEN}/items/${item.id}/content${download ? '?download' : ''}`, {
    headers: range ? { range } : {},
  })
  const response = await contentRoute(request, { params: Promise.resolve({ token: TOKEN, id: String(item.id) }) })
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) }
}

async function getZip(range?: string) {
  const request = new NextRequest(`http://localhost/api/files/s/${TOKEN}/zip`, { headers: range ? { range } : {} })
  const response = await zipRoute(request, { params: Promise.resolve({ token: TOKEN }) })
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) }
}

describe('downloads through a link', () => {
  it('counts a file the page cannot show, fetched without ?download', async () => {
    const file = await stored('backup.zip', 'application/zip')
    const link = share(file, 1)

    const first = await getFile(file)
    expect(first.status).toBe(200)
    expect(first.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(first.body).toEqual(BYTES)
    expect(link.download_count).toBe(1)

    expect((await getFile(file)).status).toBe(410)
    expect((await getFile(file, { download: true })).status).toBe(410)
  })

  it.each([
    ['a download asked for', 'report.pdf', 'application/pdf', true],
    ['a file the page cannot show', 'data.bin', 'application/octet-stream', false],
  ])('counts %s that starts past the first byte, and sends all of it', async (_, name, mime, download) => {
    const file = await stored(name, mime)
    const link = share(file, 1)

    const first = await getFile(file, { download, range: 'bytes=1-' })
    expect(first.status).toBe(200)
    expect(first.headers.get('accept-ranges')).toBe('none')
    expect(first.headers.get('content-range')).toBeNull()
    expect(first.body).toEqual(BYTES)
    expect(link.download_count).toBe(1)

    expect((await getFile(file, { download, range: 'bytes=1-' })).status).toBe(410)
  })

  it('counts every zip of a folder, whatever range it asks for', async () => {
    const folder = thing({ kind: 'FOLDER', name: 'Photos', name_key: 'photos' })
    const inside = await stored('a.txt', 'text/plain')
    state.entries = [
      { path: 'Photos', folder: true, size: 0, key: null, modified: new Date() },
      { path: 'Photos/a.txt', folder: false, size: BYTES.length, key: inside.storage_key, modified: new Date() },
    ]
    const link = share(folder, 2)

    const first = await getZip('bytes=1-')
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('application/zip')
    expect(first.body.subarray(0, 4)).toEqual(Buffer.from('PK\x03\x04', 'latin1'))
    expect(link.download_count).toBe(1)

    expect((await getZip('bytes=100-')).status).toBe(200)
    expect(link.download_count).toBe(2)
    expect((await getZip()).status).toBe(410)
  })

  it('never uses up a download for a HEAD request', async () => {
    const file = await stored('report.zip', 'application/zip')
    const link = share(file, 1)
    const head = (path: string, params: { token: string; id?: string }, route: typeof contentRoute | typeof zipRoute) =>
      route(new NextRequest(`http://localhost${path}`, { method: 'HEAD' }), { params: Promise.resolve(params) } as never)

    expect((await head(`/api/files/s/${TOKEN}/items/${file.id}/content?download`, { token: TOKEN, id: String(file.id) }, contentRoute)).status).toBe(200)
    expect(link.download_count).toBe(0)

    const folder = thing({ kind: 'FOLDER', name: 'Docs', name_key: 'docs' })
    state.entries = []
    const folderLink = share(folder, 1)
    await head(`/api/files/s/${TOKEN}/zip`, { token: TOKEN }, zipRoute)
    expect(folderLink.download_count).toBe(0)
  })

  it('lets previews through without counting, and nothing once the link is used up', async () => {
    const image = await stored('photo.png', 'image/png')
    const link = share(image, 1)

    const shown = await getFile(image)
    expect(shown.status).toBe(200)
    expect(shown.headers.get('content-type')).toBe('image/png')
    expect(shown.headers.get('content-disposition')).toMatch(/^inline/)
    const part = await getFile(image, { range: 'bytes=1-' })
    expect(part.status).toBe(206)
    expect(part.body).toEqual(BYTES.subarray(1))
    expect(link.download_count).toBe(0)

    expect((await getFile(image, { download: true })).status).toBe(200)
    expect(link.download_count).toBe(1)
    expect((await getFile(image)).status).toBe(410)
  })

  it('does not count a book opened in the reader', async () => {
    const book = await stored('novel.epub', 'application/epub+zip')
    const link = share(book, 1)

    const read = await getFile(book)
    expect(read.status).toBe(200)
    expect(read.body).toEqual(BYTES)
    expect(link.download_count).toBe(0)

    expect((await getFile(book, { download: true })).status).toBe(200)
    expect(link.download_count).toBe(1)
  })
})
