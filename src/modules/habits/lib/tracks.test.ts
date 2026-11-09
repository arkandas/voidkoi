import { describe, expect, it } from 'vitest'

import { tracksOf, usedMetrics } from './tracks'

describe('the parts of Habits an account uses', () => {
  it('are all but the ones it leaves out, in order', () => {
    expect(usedMetrics(['habits', '-habits.training'])).toEqual(['weight', 'food'])
    expect(tracksOf(['habits', '-habits.weight', '-habits.food'])).toEqual({ weight: false, food: false, training: true })
  })

  it('are all of them when the account leaves none out', () => {
    expect(usedMetrics(['habits'])).toEqual(['weight', 'food', 'training'])
  })

  it('are none without Habits', () => {
    expect(usedMetrics(['files'])).toEqual([])
  })
})
