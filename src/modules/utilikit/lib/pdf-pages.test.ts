import { describe, expect, it } from 'vitest'
import { pageRangeLabel, parsePageGroups } from '@/modules/utilikit/lib/pdf-pages'

describe('parsePageGroups', () => {
  it('selects every page when empty or "all"', () => {
    expect(parsePageGroups('', 3)).toEqual({ ok: true, groups: [[1, 2, 3]] })
    expect(parsePageGroups(' All ', 2)).toEqual({ ok: true, groups: [[1, 2]] })
  })

  it('reads single pages, ranges and open ranges in the order given', () => {
    expect(parsePageGroups('1-3, 5, 8-', 10)).toEqual({ ok: true, groups: [[1, 2, 3], [5], [8, 9, 10]] })
    expect(parsePageGroups('-2 7', 10)).toEqual({ ok: true, groups: [[1, 2], [7]] })
    expect(parsePageGroups('3;1', 5)).toEqual({ ok: true, groups: [[3], [1]] })
  })

  it('accepts spaces and en dashes inside ranges', () => {
    expect(parsePageGroups('2 - 4, 6 – 7', 8)).toEqual({ ok: true, groups: [[2, 3, 4], [6, 7]] })
  })

  it('reverses backwards ranges', () => {
    expect(parsePageGroups('4-2', 5)).toEqual({ ok: true, groups: [[4, 3, 2]] })
  })

  it('rejects pages outside the document', () => {
    expect(parsePageGroups('0', 5)).toEqual({ ok: false, error: 'pageOutOfRange' })
    expect(parsePageGroups('4-9', 5)).toEqual({ ok: false, error: 'pageOutOfRange' })
  })

  it('rejects anything that is not a page list', () => {
    for (const input of ['abc', '1-2-3', '1.5', '#3', ',', '-']) {
      expect(parsePageGroups(input, 5), input).toEqual({ ok: false, error: 'invalidPages' })
    }
  })
})

describe('pageRangeLabel', () => {
  it('names single pages, runs and lists', () => {
    expect(pageRangeLabel([4])).toBe('page-4')
    expect(pageRangeLabel([2, 3, 4])).toBe('pages-2-4')
    expect(pageRangeLabel([5, 1])).toBe('pages-5-1')
  })
})
