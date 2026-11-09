import { describe, expect, it } from 'vitest'

import { integerIn, numberIn, optionalText, requiredText } from './validate'

describe('validate', () => {
  it('trims required text and enforces its length', () => {
    expect(requiredText('  Oatmeal ', 10)).toBe('Oatmeal')
    expect(requiredText('   ', 10)).toBeNull()
    expect(requiredText('x'.repeat(11), 10)).toBeNull()
    expect(requiredText(5, 10)).toBeNull()
  })

  it('tells apart cleared and invalid optional text', () => {
    expect(optionalText(null, 10)).toBeNull()
    expect(optionalText('  ', 10)).toBeNull()
    expect(optionalText(' 5k easy ', 10)).toBe('5k easy')
    expect(optionalText('x'.repeat(11), 10)).toBeUndefined()
    expect(optionalText(5, 10)).toBeUndefined()
    expect(optionalText(undefined, 10)).toBeUndefined()
  })

  it('checks number ranges', () => {
    expect(numberIn(79.6, 1, 1000)).toBe(79.6)
    expect(numberIn(0, 1, 1000)).toBeNull()
    expect(numberIn('80', 1, 1000)).toBeNull()
    expect(numberIn(Number.NaN, 1, 1000)).toBeNull()
    expect(numberIn(Number.POSITIVE_INFINITY, 1, Number.POSITIVE_INFINITY)).toBeNull()
    expect(integerIn(4, 1, 7)).toBe(4)
    expect(integerIn(4.5, 1, 7)).toBeNull()
    expect(integerIn(8, 1, 7)).toBeNull()
    expect(integerIn('4', 1, 7)).toBeNull()
  })
})
