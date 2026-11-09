import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { coverHref, epubCover } from './media'

interface Crafted {
  name: string
  data: Buffer
  /** The size the ZIP claims the file inflates to, whatever it really does. */
  claims?: number
}

/** A ZIP written by hand, so that it can lie about its files' sizes. */
function craftedZip(entries: Crafted[]): Buffer {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const packed = deflateRawSync(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(entry.claims ?? entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(entry.claims ?? entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    parts.push(local, name, packed)
    directory.push(central, name)
    offset += local.length + name.length + packed.length
  }
  const listing = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(listing.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, listing, end])
}

const CONTAINER = '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'
const PACKAGE = '<manifest><item id="i" properties="cover-image" href="cover.png" media-type="image/png"/></manifest>'

describe('coverHref', () => {
  it('takes the item marked as the cover image (EPUB 3)', () => {
    const opf = `<package><manifest>
      <item id="c" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
      <item properties="cover-image" media-type="image/jpeg" id="img" href="images/front.jpg"/>
    </manifest></package>`
    expect(coverHref(opf)).toBe('images/front.jpg')
  })

  it('takes the image the cover meta names (EPUB 2)', () => {
    const opf = `<package><metadata><meta name="cover" content="my-cover"/></metadata>
      <manifest><item id="my-cover" href='Cover%20Art.png' media-type='image/png'/></manifest></package>`
    expect(coverHref(opf)).toBe('Cover%20Art.png')
  })

  it('falls back to an image called cover, and has nothing otherwise', () => {
    expect(coverHref('<manifest><opf:item id="cover-jpg" href="c.jpg" media-type="image/jpeg"/></manifest>')).toBe('c.jpg')
    expect(coverHref('<manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>')).toBeNull()
  })
})

describe('epubCover', () => {
  let dir = ''

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function book(files: Record<string, string | Uint8Array>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'files-epub-'))
    const path = join(dir, 'book.epub')
    const entries = Object.fromEntries(Object.entries(files).map(([name, body]) => [name, typeof body === 'string' ? strToU8(body) : body]))
    await writeFile(path, zipSync(entries))
    return path
  }

  it('reads the cover the package names, relative to the package', async () => {
    const image = new Uint8Array([1, 2, 3, 4])
    const path = await book({
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
      'OEBPS/content.opf': '<manifest><item id="i" properties="cover-image" href="../Images/My%20Cover.jpg" media-type="image/jpeg"/></manifest>',
      'Images/My Cover.jpg': image,
    })
    expect(new Uint8Array((await epubCover(path))!)).toEqual(image)
  })

  it('has nothing for a book without a cover, or a ZIP that is no book', async () => {
    expect(
      await epubCover(
        await book({
          'META-INF/container.xml': '<rootfile full-path="content.opf"/>',
          'content.opf': '<manifest><item id="t" href="t.xhtml" media-type="application/xhtml+xml"/></manifest>',
        }),
      ),
    ).toBeNull()
    await rm(dir, { recursive: true, force: true })
    expect(await epubCover(await book({ 'readme.txt': 'hello' }))).toBeNull()
  })

  async function craftedBook(entries: Crafted[]): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'files-epub-'))
    const path = join(dir, 'book.epub')
    await writeFile(path, craftedZip(entries))
    return path
  }

  it('reads a cover from a ZIP written by hand, when it tells the truth', async () => {
    const image = Buffer.from('a picture')
    const path = await craftedBook([
      { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER) },
      { name: 'content.opf', data: Buffer.from(PACKAGE) },
      { name: 'cover.png', data: image },
    ])
    expect(await epubCover(path)).toEqual(image)
  })

  it('opens nothing that claims gigabytes', async () => {
    const huge = 0xfffffff0
    for (const lie of ['META-INF/container.xml', 'content.opf', 'cover.png']) {
      const path = await craftedBook([
        { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER), claims: lie === 'META-INF/container.xml' ? huge : undefined },
        { name: 'content.opf', data: Buffer.from(PACKAGE), claims: lie === 'content.opf' ? huge : undefined },
        { name: 'cover.png', data: Buffer.from('a picture'), claims: lie === 'cover.png' ? huge : undefined },
      ])
      expect(await epubCover(path)).toBeNull()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stops inflating a file at the limit when it claims to be small', async () => {
    // 64 MiB of zeros packs into about 64 KiB, and claims to be 100 bytes.
    const path = await craftedBook([
      { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER) },
      { name: 'content.opf', data: Buffer.from(PACKAGE) },
      { name: 'cover.png', data: Buffer.alloc(64 * 1024 * 1024), claims: 100 },
    ])
    expect(await epubCover(path)).toBeNull()
  })
})
