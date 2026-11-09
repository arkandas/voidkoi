import { describe, expect, it } from 'vitest'
import { formatTimestamp, parseTimestamp, parseTrimFields, resolveTrim, trimInputArgs, trimOutputArgs } from '@/modules/utilikit/lib/time-range'

describe('parseTimestamp', () => {
  it('reads seconds, minutes and hours', () => {
    expect(parseTimestamp('90')).toBe(90)
    expect(parseTimestamp('90.5')).toBe(90.5)
    expect(parseTimestamp('1:30')).toBe(90)
    expect(parseTimestamp('1:30,25')).toBe(90.25)
    expect(parseTimestamp('01:02:03')).toBe(3723)
    expect(parseTimestamp(' 0:05.5 ')).toBe(5.5)
  })

  it('rejects anything else', () => {
    for (const value of ['', 'abc', '1:60', '1:60:00', '-5', '1::2', '1:2:3:4', '1.5:30']) {
      expect(parseTimestamp(value), value).toBeNull()
    }
  })
})

describe('formatTimestamp', () => {
  it('writes minutes and seconds, with hours when needed', () => {
    expect(formatTimestamp(5.5)).toBe('0:05.5')
    expect(formatTimestamp(90)).toBe('1:30')
    expect(formatTimestamp(3723.25)).toBe('1:02:03.25')
    expect(formatTimestamp(-3)).toBe('0:00')
  })

  it('round-trips through parseTimestamp', () => {
    for (const seconds of [0, 1.25, 59.99, 61, 3599.5, 7322]) expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds)
  })
})

describe('resolveTrim', () => {
  it('returns no trim for the whole file', () => {
    expect(resolveTrim(null, null, 120)).toEqual({ ok: true, trim: null })
    expect(resolveTrim(0, 120, 120)).toEqual({ ok: true, trim: null })
    expect(resolveTrim(0, 500, 120)).toEqual({ ok: true, trim: null })
  })

  it('computes the start and length of the clip', () => {
    expect(resolveTrim(10, 25.5, 120)).toEqual({ ok: true, trim: { start: 10, duration: 15.5 } })
    expect(resolveTrim(100, null, 120)).toEqual({ ok: true, trim: { start: 100, duration: 20 } })
    expect(resolveTrim(null, 30, 120)).toEqual({ ok: true, trim: { start: 0, duration: 30 } })
  })

  it('clamps the end to the length of the file', () => {
    expect(resolveTrim(100, 500, 120)).toEqual({ ok: true, trim: { start: 100, duration: 20 } })
  })

  it('works when the length is unknown', () => {
    expect(resolveTrim(5, 10, 0)).toEqual({ ok: true, trim: { start: 5, duration: 5 } })
    expect(resolveTrim(5, null, 0)).toEqual({ ok: false })
  })

  it('rejects impossible ranges', () => {
    expect(resolveTrim(30, 20, 120)).toEqual({ ok: false })
    expect(resolveTrim(30, 30, 120)).toEqual({ ok: false })
    expect(resolveTrim(130, null, 120)).toEqual({ ok: false })
    expect(resolveTrim(-1, null, 120)).toEqual({ ok: false })
  })
})

describe('parseTrimFields', () => {
  it('reads form values', () => {
    expect(parseTrimFields('10', '20', 60)).toEqual({ ok: true, trim: { start: 10, duration: 10 } })
    expect(parseTrimFields(null, '', 60)).toEqual({ ok: true, trim: null })
    expect(parseTrimFields('x', null, 60)).toEqual({ ok: false })
  })
})

describe('trim arguments', () => {
  it('seeks before the input and limits the output', () => {
    const trim = { start: 1.5, duration: 10 }
    expect(trimInputArgs(trim)).toEqual(['-ss', '1.500'])
    expect(trimOutputArgs(trim)).toEqual(['-t', '10.000'])
    expect([...trimInputArgs(null), ...trimOutputArgs(null)]).toEqual([])
  })
})
