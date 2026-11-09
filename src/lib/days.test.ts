import { describe, expect, it } from 'vitest'
import { addDays, addMonths, addMonthsTo, calendarDays, dayDate, dayKey, daysBetween, firstDayOfWeek, monthOf } from '@/lib/days'

describe('days', () => {
  it('reads and writes days in local time', () => {
    expect(dayKey(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27')
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(dayKey(dayDate('2026-10-27'))).toBe('2026-10-27')
    expect(monthOf('2026-10-27')).toEqual({ year: 2026, month: 9 })
  })

  it('adds days across months and years', () => {
    expect(addDays('2026-10-20', 7)).toBe('2026-10-27')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('adds months, keeping to the end of shorter ones', () => {
    expect(addMonths('2026-10-20', 1)).toBe('2026-11-20')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsTo({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonthsTo({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
  })

  it('counts whole days, across a clock change too', () => {
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7)
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0)
    expect(daysBetween('2026-10-21', '2026-10-20')).toBe(-1)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('lays a month out in six weeks from the first day of the week', () => {
    // October 2026 starts on a Thursday.
    const monday = calendarDays({ year: 2026, month: 9 }, 1)
    expect(monday).toHaveLength(42)
    expect(monday.slice(0, 4)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'])
    expect(monday.at(-1)).toBe('2026-11-08')

    const sunday = calendarDays({ year: 2026, month: 9 }, 0)
    expect(sunday[0]).toBe('2026-09-27')
    expect(sunday[4]).toBe('2026-10-01')

    // February 2026 starts on a Sunday: no days from January when weeks start then.
    expect(calendarDays({ year: 2026, month: 1 }, 0)[0]).toBe('2026-02-01')
    expect(calendarDays({ year: 2026, month: 1 }, 1)[0]).toBe('2026-01-26')
  })

  it('starts the week where people do', () => {
    expect(firstDayOfWeek('es-ES')).toBe(1)
    expect(firstDayOfWeek('en-GB')).toBe(1)
    expect(firstDayOfWeek('en-US')).toBe(0)
    expect(firstDayOfWeek('en')).toBe(0)
    expect(firstDayOfWeek('es')).toBe(1)
    expect(firstDayOfWeek('not a locale')).toBe(1)
  })
})
