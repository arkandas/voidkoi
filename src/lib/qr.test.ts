import { encode } from 'uqr'
import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, qrCode } from '@/lib/qr'

/** The modules a path fills, read back from its runs. */
function filled(path: string): Set<string> {
  const cells = new Set<string>()
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let dx = 0; dx < Number(width); dx++) cells.add(`${Number(x) + dx},${y}`)
  }
  return cells
}

describe('qrCode', () => {
  const url = 'https://files.example.com/u/abcdefghijklmnopqrstuvwx'
  const code = qrCode(url)

  it('fills exactly the dark modules', () => {
    const { data } = encode(url, { ecc: 'M', border: QUIET_ZONE })
    const dark = new Set<string>()
    data.forEach((row, y) => row.forEach((on, x) => on && dark.add(`${x},${y}`)))
    expect(filled(code.path)).toEqual(dark)
    expect(code.size).toBe(data.length)
  })

  it('leaves the margin white', () => {
    for (const cell of filled(code.path)) {
      const [x, y] = cell.split(',').map(Number) as [number, number]
      expect(Math.min(x, y, code.size - 1 - x, code.size - 1 - y)).toBeGreaterThanOrEqual(QUIET_ZONE)
    }
  })

  it('keeps a link small enough to scan from a screen', () => {
    // Version 4 is 33 modules a side; a link this long needs no more.
    expect(code.size - 2 * QUIET_ZONE).toBeLessThanOrEqual(33)
  })
})
