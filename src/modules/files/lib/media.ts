import { spawn } from 'node:child_process'
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import decodeHeic from 'heic-decode'
import { MEDIA_DEMUXERS } from '@/lib/media-input'

/**
 * Pictures from files the image library can't read on its own: HEIC photos,
 * through their own decoder; videos and the album art in songs, through
 * ffmpeg; PDFs, through poppler's pdftoppm, the last two only when the server
 * has them; the covers of books, from inside the EPUB; and text files, drawn
 * as a page with their first lines.
 */

export interface Pixels {
  /** RGBA, four bytes a pixel. */
  data: Uint8ClampedArray
  width: number
  height: number
}

/** The picture in a HEIC or HEIF file, upright. */
/** The most pixels a HEIC photo may have to be decoded: past the largest phone cameras, short of filling memory. */
const MAX_HEIC_PIXELS = 200_000_000

/** A HEIC photo's pixels, measured before anything is decoded, so a giant one is refused for free. */
export async function heicPixels(path: string): Promise<Pixels> {
  const images = await decodeHeic.all({ buffer: await readFile(path) })
  try {
    const first = images[0]
    if (!first || first.width * first.height > MAX_HEIC_PIXELS) throw new Error('The HEIC picture is too large to decode')
    const { data, width, height } = await first.decode()
    return { data, width, height }
  } finally {
    images.dispose()
  }
}

/** Frames and pages are taken this big at most: twice the thumbnail, for sharp screens. */
const FRAME_EDGE = 960


const TIMEOUT_MS = 30_000
const MAX_IMAGE_BYTES = 32 * 1024 * 1024

const tools = new Map<string, Promise<boolean>>()

/** Whether a command-line tool can be run. Asked once each: they don't come or go while the server runs. */
export function has(command: string, versionFlag: string): Promise<boolean> {
  let found = tools.get(command)
  if (!found) {
    found = new Promise(resolve => {
      const child = spawn(command, [versionFlag], { stdio: 'ignore' })
      child.on('error', () => resolve(false))
      child.on('close', code => resolve(code === 0))
    })
    tools.set(command, found)
  }
  return found
}

/** Run a tool with a time limit. What it printed when it succeeded, else null. */
function run(command: string, args: string[]): Promise<Buffer | null> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const chunks: Buffer[] = []
    let size = 0
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_IMAGE_BYTES) child.kill('SIGKILL')
      else chunks.push(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve(code === 0 && size <= MAX_IMAGE_BYTES ? Buffer.concat(chunks) : null)
    })
  })
}

async function frameAt(path: string, seconds: string): Promise<Buffer | null> {
  const frame = await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-protocol_whitelist', 'file',
    '-format_whitelist', MEDIA_DEMUXERS,
    '-ss', seconds, '-i', path,
    '-frames:v', '1', '-an', '-sn', '-dn',
    '-vf', `scale=${FRAME_EDGE}:${FRAME_EDGE}:force_original_aspect_ratio=decrease`,
    '-f', 'image2pipe', '-c:v', 'png', 'pipe:1',
  ])
  return frame && frame.length > 0 ? frame : null
}

/** A frame a second into a video, or its first one when it is shorter, as PNG. Null without ffmpeg. */
export async function videoFrame(path: string): Promise<Buffer | null> {
  if (!(await has('ffmpeg', '-version'))) return null
  return (await frameAt(path, '1')) ?? (await frameAt(path, '0'))
}

/** The album art in a song, as PNG. Null without ffmpeg, or for a song without any. */
export async function audioCover(path: string): Promise<Buffer | null> {
  if (!(await has('ffmpeg', '-version'))) return null
  const cover = await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-protocol_whitelist', 'file',
    '-format_whitelist', MEDIA_DEMUXERS,
    '-i', path,
    '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
    '-vf', `scale=${FRAME_EDGE}:${FRAME_EDGE}:force_original_aspect_ratio=decrease`,
    '-f', 'image2pipe', '-c:v', 'png', 'pipe:1',
  ])
  return cover && cover.length > 0 ? cover : null
}

/** Books bigger than this aren't opened for their cover. */
const MAX_BOOK_BYTES = 200 * 1024 * 1024

/** A book's container and package documents are read up to this size. */
const MAX_PACKAGE_BYTES = 4 * 1024 * 1024

/**
 * One file in a ZIP, by name, or null when it isn't there, can't be read, or
 * is bigger than `limit`. Only that file is inflated, and never past `limit`:
 * a small ZIP can claim, or hold, gigabytes.
 */
function zipEntry(zip: Buffer, name: string, limit: number): Buffer | null {
  try {
    // The end of the central directory, after a comment of up to 64 KiB.
    let end = -1
    for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
      if (zip.readUInt32LE(at) === 0x06054b50) {
        end = at
        break
      }
    }
    if (end < 0) return null
    let at = zip.readUInt32LE(end + 16)
    for (let left = zip.readUInt16LE(end + 10); left > 0; left--) {
      if (zip.readUInt32LE(at) !== 0x02014b50) return null
      const nameLength = zip.readUInt16LE(at + 28)
      const utf8 = (zip.readUInt16LE(at + 8) & 0x800) !== 0
      if (zip.toString(utf8 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLength) === name) {
        const method = zip.readUInt16LE(at + 10)
        const packed = zip.readUInt32LE(at + 20)
        const size = zip.readUInt32LE(at + 24)
        const local = zip.readUInt32LE(at + 42)
        if (size > limit || zip.readUInt32LE(local) !== 0x04034b50) return null
        const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
        const data = zip.subarray(start, start + packed)
        if (data.length !== packed) return null
        if (method === 0) return size === packed ? Buffer.from(data) : null
        return method === 8 ? inflateRawSync(data, { maxOutputLength: limit }) : null
      }
      at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    }
    return null
  } catch {
    return null
  }
}

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? ''
  }
  return found
}

/**
 * Where a book's cover image is, from its package document (the OPF):
 * the item marked as the cover image (EPUB 3), the one the `cover` meta
 * names (EPUB 2), or an image with "cover" in its id. Relative to the OPF.
 */
export function coverHref(opf: string): string | null {
  const items = [...opf.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)].map(match => attributes(match[0]))
  const isImage = (item: Record<string, string>) => (item['media-type'] ?? '').startsWith('image/')
  const marked = items.find(item => (item.properties ?? '').split(/\s+/).includes('cover-image'))
  if (marked?.href) return marked.href
  const meta = [...opf.matchAll(/<(?:\w+:)?meta\b[^>]*>/gi)].map(match => attributes(match[0])).find(meta => meta.name === 'cover')
  const named = meta?.content ? items.find(item => item.id === meta.content && isImage(item)) : undefined
  if (named?.href) return named.href
  return items.find(item => isImage(item) && /cover/i.test(item.id ?? ''))?.href ?? null
}

/** The cover of an EPUB book, as its image file. Null when it has none or isn't a readable book. */
export async function epubCover(path: string): Promise<Buffer | null> {
  if ((await stat(path)).size > MAX_BOOK_BYTES) return null
  const book = await readFile(path)

  const container = zipEntry(book, 'META-INF/container.xml', MAX_PACKAGE_BYTES)
  const opfPath = container && /full-path\s*=\s*"([^"]+)"/.exec(new TextDecoder().decode(container))?.[1]
  const opf = opfPath ? zipEntry(book, opfPath, MAX_PACKAGE_BYTES) : null
  const href = opf && coverHref(new TextDecoder().decode(opf))
  if (!opfPath || !href) return null
  const image = zipEntry(book, posix.normalize(posix.join(posix.dirname(opfPath), decodeURIComponent(href.split('#')[0]!))), MAX_IMAGE_BYTES)
  return image && image.length > 0 ? image : null
}

/** The first page of a PDF, as PNG. Null without pdftoppm, or for a PDF it can't open, like one with a password. */
export async function pdfPage(path: string): Promise<Buffer | null> {
  if (!(await has('pdftoppm', '-v'))) return null
  // pdftoppm only writes files, never to stdout: it gets a folder of its own.
  const dir = await mkdtemp(join(/*turbopackIgnore: true*/ tmpdir(), 'files-pdf-'))
  try {
    const target = join(/*turbopackIgnore: true*/ dir, 'page')
    const args = ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to', String(FRAME_EDGE), path, target]
    if ((await run('pdftoppm', args)) === null) return null
    const page = await readFile(/*turbopackIgnore: true*/ `${target}.png`).catch(() => null)
    return page && page.length > 0 && page.length <= MAX_IMAGE_BYTES ? page : null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** How much of a text file its thumbnail reads. */
const TEXT_BYTES = 4096

const PAGE_WIDTH = 480
const PAGE_HEIGHT = 360
const PAGE_PADDING = 26

const MONO = "'Liberation Mono', Menlo, Consolas, monospace"
const SANS = "'Liberation Sans', Helvetica, Arial, sans-serif"

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
}

interface PageLine {
  text: string
  size: number
  height: number
  bold: boolean
}

/** Markdown read loosely: headings bold and bigger, list markers as bullets, emphasis marks gone. */
function markdownLine(line: string): PageLine {
  const heading = /^(#{1,6})\s+(.*)$/.exec(line)
  if (heading) {
    const big = heading[1]!.length <= 2
    return { text: heading[2]!, size: big ? 21 : 17, height: big ? 30 : 25, bold: true }
  }
  const text = line.replace(/^(\s*)[-*+]\s+/, '$1• ').replace(/\*\*|__|`/g, '')
  return { text, size: 15, height: 22, bold: false }
}

/** The first lines of a text file as an SVG page, or null when there is nothing to show. */
export async function textPage(path: string, markdown: boolean): Promise<Buffer | null> {
  const handle = await open(path, 'r')
  let text: string
  try {
    const buffer = Buffer.alloc(TEXT_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, TEXT_BYTES, 0)
    text = new TextDecoder('utf-8').decode(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }

  const raw = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\t/g, '    ').split('\n')
  if (!raw.some(line => line.trim())) return null
  const lines: PageLine[] = raw.map(line =>
    markdown ? markdownLine(line) : { text: line, size: 13, height: 19, bold: false },
  )

  let y = PAGE_PADDING
  const rows: string[] = []
  for (const line of lines) {
    if (y + line.height > PAGE_HEIGHT) break
    y += line.height
    if (!line.text.trim()) continue
    rows.push(
      `<text x="${PAGE_PADDING}" y="${y - Math.round(line.height * 0.28)}" font-size="${line.size}"` +
        `${line.bold ? ' font-weight="700" fill="#0f172a"' : ''}>${escapeXml(line.text.slice(0, 120))}</text>`,
    )
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}">` +
    `<defs><clipPath id="page"><rect x="${PAGE_PADDING}" y="0" width="${PAGE_WIDTH - PAGE_PADDING * 2}" height="${PAGE_HEIGHT}"/></clipPath></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<g clip-path="url(#page)" xml:space="preserve" fill="#334155" font-family="${escapeXml(markdown ? SANS : MONO)}">${rows.join('')}</g>` +
    `</svg>`
  return Buffer.from(svg)
}
