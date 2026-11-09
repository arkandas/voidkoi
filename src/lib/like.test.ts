import { describe, expect, it } from 'vitest'

import { equalsIgnoringCase, escapeLike } from './like'

describe('LIKE patterns', () => {
  it('escape the characters that would match more than themselves', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    expect(escapeLike('plain@example.com')).toBe('plain@example.com')
  })

  it('make an exact, case-blind match for Prisma', () => {
    expect(equalsIgnoringCase('%@example.com')).toEqual({ equals: '\\%@example.com', mode: 'insensitive' })
  })
})
