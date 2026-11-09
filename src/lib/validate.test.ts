import { describe, expect, it } from 'vitest'
import { LIMITS, parseExpiry, parseId, parseLinkPassword } from '@/lib/validate'

describe('parseId', () => {
  it('reads a positive whole number from a number or text', () => {
    expect(parseId(42)).toBe(42)
    expect(parseId(' 42 ')).toBe(42)
  })

  it('refuses zero, fractions, text and ids past what the database holds', () => {
    expect(parseId(0)).toBeNull()
    expect(parseId(1.5)).toBeNull()
    expect(parseId('4x')).toBeNull()
    expect(parseId(2_147_483_647)).toBe(2_147_483_647)
    expect(parseId(2_147_483_648)).toBeNull()
    expect(parseId('99999999999')).toBeNull()
  })
})

describe('parseLinkPassword', () => {
  it('keeps the password when the field is left out', () => {
    expect(parseLinkPassword({ expiresAt: null })).toBeUndefined()
  })

  it('removes it with null', () => {
    expect(parseLinkPassword({ password: null })).toBeNull()
  })

  it('takes a new one', () => {
    expect(parseLinkPassword({ password: 'river stone' })).toBe('river stone')
  })

  it('refuses an empty, too long or non-text password', () => {
    expect(parseLinkPassword({ password: '' })).toBe(false)
    expect(parseLinkPassword({ password: 'x'.repeat(LIMITS.linkPasswordMax + 1) })).toBe(false)
    expect(parseLinkPassword({ password: 1234 })).toBe(false)
  })
})

describe('parseExpiry', () => {
  const now = new Date('2026-10-19T10:00:00Z')

  it('reads no expiry from null or a missing field', () => {
    expect(parseExpiry(null, now)).toBeNull()
    expect(parseExpiry(undefined, now)).toBeNull()
  })

  it('takes a moment in the future', () => {
    expect(parseExpiry('2026-10-25T21:59:59.000Z', now)).toEqual(new Date('2026-10-25T21:59:59.000Z'))
  })

  it('refuses the past, now, and anything that is not a date', () => {
    expect(parseExpiry('2026-10-18T10:00:00Z', now)).toBe(false)
    expect(parseExpiry(now.toISOString(), now)).toBe(false)
    expect(parseExpiry('next week', now)).toBe(false)
    expect(parseExpiry(1792000000000, now)).toBe(false)
  })
})
