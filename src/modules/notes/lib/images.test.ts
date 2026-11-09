import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { extensionFor, imageId, imageIdsIn, imagePath, sniffImageType } = await import('./images')

const ID = 'a'.repeat(64)

describe('imagePath', () => {
  it('names the file after the id and its format, under the notes folder', () => {
    expect(imagePath(ID, 'image/webp')).toMatch(new RegExp(`notes/images/${ID}\\.webp$`))
    expect(imagePath(ID, 'image/jpeg')).toMatch(/\.jpg$/)
  })

  it.each([
    ['../../etc/passwd', 'traversal'],
    ['a/b', 'a slash'],
    ['A'.repeat(64), 'uppercase, which a sha256 hex digest never is'],
    ['abc', 'too short'],
    ['', 'empty'],
  ])('rejects %j (%s)', id => {
    expect(() => imagePath(id, 'image/png')).toThrow('Bad image id')
  })
})

describe('extensionFor', () => {
  it('maps the formats the upload route accepts', () => {
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/avif')).toBe('avif')
  })

  it('falls back rather than trusting an unknown type into the filename', () => {
    expect(extensionFor('application/x-evil')).toBe('bin')
  })

  it('takes the type from the bytes, never from what the browser claimed', () => {
    const bytes = (...values: number[]) => new Uint8Array(values)
    const text = (value: string) => new TextEncoder().encode(value)
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImageType(text('GIF89a....'))).toBe('image/gif')
    expect(sniffImageType(text('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(text('\0\0\0\x1cftypavif'))).toBe('image/avif')
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImageType(text('<html><script>alert(1)</script>'))).toBeNull()
  })
})

describe('imageId', () => {
  const bytes = new TextEncoder().encode('the same picture')

  it('is the same for the same picture from the same account', () => {
    expect(imageId(1, bytes)).toBe(imageId(1, bytes))
  })

  it('differs between accounts, so each keeps its own copy', () => {
    expect(imageId(1, bytes)).not.toBe(imageId(2, bytes))
  })

  it('is a full sha256 digest', () => {
    expect(imageId(1, bytes)).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('imageIdsIn', () => {
  it('finds every picture a note shows', () => {
    const b = 'b'.repeat(64)
    const markdown = `![one](/api/notes/images/${ID})\n\ntext\n\n![two](/api/notes/images/${b})`
    expect(imageIdsIn(markdown)).toEqual([ID, b])
  })

  it('finds them in HTML too', () => {
    expect(imageIdsIn(`<img src="/api/notes/images/${ID}" width="200">`)).toEqual([ID])
  })

  it('reports a repeat twice, so callers can count references', () => {
    expect(imageIdsIn(`![a](/api/notes/images/${ID}) ![b](/api/notes/images/${ID})`)).toHaveLength(2)
  })

  it('ignores anything that is not a full digest', () => {
    expect(imageIdsIn('![x](/api/notes/images/nope) ![y](/api/notes/images/abc123)')).toEqual([])
  })

  it('finds none in a note without pictures', () => {
    expect(imageIdsIn('# Heading\n\nJust words.')).toEqual([])
  })
})
