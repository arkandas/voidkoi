import { describe, expect, it } from 'vitest'

import { createFormat, parseDecimal, parseIntStrict, type FormatWords } from './format'

const words: FormatWords = {
  minutes: m => `${m} min`,
  hours: h => `${h}h`,
  hoursMinutes: (h, m) => `${h}h ${m}m`,
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  daysAgo: n => `${n} days ago`,
  inDays: n => `In ${n} days`,
}
const en = createFormat('en', words)
const es = createFormat('es', words)

describe('parsing', () => {
  it('reads decimals with a point or a comma', () => {
    expect(parseDecimal('79.6')).toBe(79.6)
    expect(parseDecimal(' 79,6 ')).toBe(79.6)
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
  })

  it('reads whole numbers only', () => {
    expect(parseIntStrict(' 350 ')).toBe(350)
    expect(parseIntStrict('1.5')).toBeNaN()
    expect(parseIntStrict('-3')).toBeNaN()
  })
})

describe('numbers', () => {
  it('formats kilos with one decimal in each language', () => {
    expect(en.kg(79.6)).toBe('79.6')
    expect(en.kg(80)).toBe('80.0')
    expect(es.kg(79.6)).toBe('79,6')
  })

  it('signs changes with a true minus and shows no sign for zero', () => {
    expect(en.delta(-0.44)).toBe('−0.4')
    expect(en.delta(1.26)).toBe('+1.3')
    expect(en.delta(0.04)).toBe('0.0')
    expect(en.rate(-0.25)).toBe('−0.25')
    expect(es.rate(0.5)).toBe('+0,5')
  })

  it('groups thousands the way each language does', () => {
    expect(en.int(1090.4)).toBe('1,090')
    expect(es.int(1090)).toBe('1090')
    expect(es.int(49080)).toBe('49.080')
    expect(es.num(1.5)).toBe('1,5')
  })

  it('writes durations in minutes, hours, or both', () => {
    expect(en.duration(45)).toBe('45 min')
    expect(en.duration(120)).toBe('2h')
    expect(en.duration(135)).toBe('2h 15m')
    expect(en.minutes(90)).toBe('90 min')
  })
})

describe('dates', () => {
  it('formats a day in each language', () => {
    expect(en.date('2026-09-30', 'monthDay')).toBe('Sep 30')
    expect(es.date('2026-09-30', 'monthDay')).toBe('30 sept')
    expect(en.date('2026-09-30', 'longDate')).toBe('Wednesday, September 30')
    expect(es.title(es.date('2026-09-30', 'longDate'))).toBe('Miércoles, 30 de septiembre')
  })

  it('knows which languages put the month first', () => {
    expect(en.monthFirst).toBe(true)
    expect(es.monthFirst).toBe(false)
  })

  it('names nearby days and dates the rest', () => {
    expect(en.relative('2026-09-30', '2026-09-30')).toBe('Today')
    expect(en.relative('2026-09-29', '2026-09-30')).toBe('Yesterday')
    expect(en.relative('2026-10-01', '2026-09-30')).toBe('Tomorrow')
    expect(en.relative('2026-09-25', '2026-09-30')).toBe('5 days ago')
    expect(en.relative('2026-10-05', '2026-09-30')).toBe('In 5 days')
    expect(en.relative('2026-07-01', '2026-09-30')).toBe('Jul 1')
    expect(en.relative('2025-07-01', '2026-09-30')).toBe('Jul 1, 2025')
  })
})
