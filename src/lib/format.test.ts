import { describe, expect, it } from 'vitest'

import { formatBytes, formatDuration } from './format'

describe('formatBytes', () => {
  it('reads in powers of 1024, one decimal while it matters', () => {
    expect(formatBytes(0, 'en')).toBe('0 B')
    expect(formatBytes(512, 'en')).toBe('512 B')
    expect(formatBytes(1024, 'en')).toBe('1 KB')
    expect(formatBytes(1536, 'en')).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5 MB')
    expect(formatBytes(2.25 * 1024 ** 3, 'en')).toBe('2.3 GB')
    expect(formatBytes(150 * 1024 ** 2, 'en')).toBe('150 MB')
  })

  it('steps up rather than printing 1024 of a unit', () => {
    expect(formatBytes(1024 * 1024 - 1, 'en')).toBe('1 MB')
  })

  it('uses the locale’s decimal separator', () => {
    expect(formatBytes(1536, 'es')).toBe('1,5 KB')
  })

  it('reads anything that isn’t a size as nothing', () => {
    expect(formatBytes(-5, 'en')).toBe('0 B')
    expect(formatBytes(Number.NaN, 'en')).toBe('0 B')
    expect(formatBytes(Number.POSITIVE_INFINITY, 'en')).toBe('0 B')
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [59.9, '0:59'],
    [65, '1:05'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
  ])('reads %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('never shows a negative or broken time', () => {
    expect(formatDuration(-5)).toBe('0:00')
    expect(formatDuration(Number.NaN)).toBe('0:00')
  })
})
