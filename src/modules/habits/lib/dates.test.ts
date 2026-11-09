import { describe, expect, it } from 'vitest'

import { historyRange, isDayKey, isMonthKey, monthGrid, monthKey, weekKeys } from './dates'

describe('days and months', () => {
  it('only accept real days and months', () => {
    expect(isDayKey('2026-09-30')).toBe(true)
    expect(isDayKey('2024-02-29')).toBe(true)
    expect(isDayKey('2026-02-29')).toBe(false)
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('2026-9-1')).toBe(false)
    expect(isDayKey(null)).toBe(false)
    expect(isDayKey(20260930)).toBe(false)
    expect(isMonthKey('2026-09')).toBe(true)
    expect(isMonthKey('2026-00')).toBe(false)
    expect(isMonthKey('2026-9')).toBe(false)
    expect(monthKey(new Date(2026, 8, 30))).toBe('2026-09')
  })

  it('run weeks Monday to Sunday, across months and clock changes', () => {
    expect(weekKeys('2026-09-30')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weekKeys('2026-10-04')[0]).toBe('2026-09-28')
    expect(weekKeys('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(weekKeys('2026-03-29')[0]).toBe('2026-03-23')
  })

  it('show a month in whole weeks', () => {
    const october = monthGrid(new Date(2026, 9, 1))
    expect(october[0]).toBe('2026-09-28')
    expect(october.at(-1)).toBe('2026-11-01')
    expect(october).toHaveLength(35)
    // February 2027 starts on a Monday and ends on a Sunday: four weeks, nothing around them.
    expect(monthGrid(new Date(2027, 1, 1))).toHaveLength(28)
  })

  it('look back over a year and a bit, and a few weeks ahead', () => {
    expect(historyRange('2026-10-22')).toEqual({ start: '2025-08-18', end: '2026-12-03' })
  })
})
