import { describe, expect, it } from 'vitest'

import { allow } from './rate-limit'

describe('allow', () => {
  it('lets through up to the limit in the window, then refuses', () => {
    const key = `test:${Math.random()}`
    expect([1, 2, 3].map(() => allow(key, 2, 60_000))).toEqual([true, true, false])
  })

  it('keeps counting each key on its own', () => {
    const a = `a:${Math.random()}`
    const b = `b:${Math.random()}`
    expect(allow(a, 1, 60_000)).toBe(true)
    expect(allow(b, 1, 60_000)).toBe(true)
    expect(allow(a, 1, 60_000)).toBe(false)
  })

  it('stays bounded under a flood of new keys', () => {
    for (let i = 0; i < 25_000; i++) allow(`flood:${i}`, 5, 60_000)
    // The most recent keys are still counted.
    expect(allow('flood:24999', 1, 60_000)).toBe(false)
  })
})
