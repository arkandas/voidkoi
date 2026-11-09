import { beforeEach, describe, expect, it, vi } from 'vitest'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-22T12:00:00Z')

type Row = { id: string; mime: string; user_id: number | null; created_at: Date }
const db = vi.hoisted(() => ({ images: [] as Row[], notes: [] as { user_id: number; content: string }[] }))
const removed = vi.hoisted(() => [] as string[])

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(async (path: string) => {
    removed.push(path)
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    noteImage: {
      findMany: async ({ where }: { where: { created_at: { lt: Date } } }) =>
        db.images.filter(image => image.created_at < where.created_at.lt),
      deleteMany: async ({ where }: { where: { id: string; created_at: { lt: Date } } }) => {
        const before = db.images.length
        db.images = db.images.filter(image => !(image.id === where.id && image.created_at < where.created_at.lt))
        return { count: before - db.images.length }
      },
    },
    note: {
      count: async ({ where }: { where: { user_id: number; content: { contains: string } } }) =>
        db.notes.filter(note => note.user_id === where.user_id && note.content.includes(where.content.contains)).length,
    },
  },
}))

const { sweepImages } = await import('./images')

const id = (letter: string): string => letter.repeat(64)
const image = (letter: string, userId: number | null, age: number): Row => ({
  id: id(letter),
  mime: 'image/png',
  user_id: userId,
  created_at: new Date(NOW.getTime() - age),
})

beforeEach(() => {
  removed.length = 0
  db.notes = [
    { user_id: 1, content: `![kept](/api/notes/images/${id('a')})` },
    // Someone else mentioning a picture doesn't keep it: it isn't theirs.
    { user_id: 2, content: `![not theirs](/api/notes/images/${id('b')})` },
  ]
  db.images = [
    image('a', 1, 2 * DAY),
    image('b', 1, 2 * DAY),
    image('c', 1, DAY / 2),
    image('d', null, 2 * DAY),
  ]
})

describe('sweepImages', () => {
  it('removes pictures no note of their account mentions, and those of deleted accounts', async () => {
    expect(await sweepImages(NOW)).toBe(2)
    expect(db.images.map(row => row.id)).toEqual([id('a'), id('c')])
    expect(removed.map(path => path.split('/').pop())).toEqual([`${id('b')}.png`, `${id('d')}.png`])
  })

  it('keeps a picture added in the last day, which may still be on its way into a note', async () => {
    await sweepImages(NOW)
    expect(db.images.some(row => row.id === id('c'))).toBe(true)
  })
})
