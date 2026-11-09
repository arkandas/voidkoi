import { describe, expect, it } from 'vitest'
import { collapse, diffStats, diffText, sideBySide, type DiffLine } from '@/modules/wiki/lib/diff-view'

const text = (line: DiffLine) => line.parts.map(part => part.text).join('')

describe('diffText', () => {
  it('marks unchanged, removed and added lines with their numbers', () => {
    const lines = diffText('a\nb\nc\n', 'a\nc\nd\n')
    expect(lines.map(line => [line.kind, text(line), line.oldNumber, line.newNumber])).toEqual([
      ['same', 'a', 1, 1],
      ['removed', 'b', 2, null],
      ['same', 'c', 3, 2],
      ['added', 'd', null, 3],
    ])
  })

  it('picks out the words that changed in an edited line', () => {
    const [removed, added] = diffText('The quick fox\n', 'The slow fox\n')
    expect(removed!.parts.filter(part => part.changed).map(part => part.text)).toEqual(['quick'])
    expect(added!.parts.filter(part => part.changed).map(part => part.text)).toEqual(['slow'])
  })

  it('counts what changed', () => {
    expect(diffStats(diffText('a\nb\n', 'a\nB\nc\n'))).toEqual({ added: 2, removed: 1 })
  })

  it('handles text without a final newline', () => {
    expect(diffText('a', 'a\nb').map(line => line.kind)).toContain('added')
  })
})

describe('collapse', () => {
  it('folds unchanged lines far from any change', () => {
    const older = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    const newer = older.replace('line 10', 'line ten')
    const items = collapse(diffText(older, newer), 2)
    expect(items[0]).toEqual({ kind: 'gap', count: 8 })
    expect(items.at(-1)).toEqual({ kind: 'gap', count: 7 })
  })
})

describe('sideBySide', () => {
  it('puts an edit on one row, old left and new right', () => {
    const rows = sideBySide(diffText('a\nb\n', 'a\nB\n'))
    expect(rows).toHaveLength(2)
    const row = rows[1] as { left: DiffLine; right: DiffLine }
    expect(text(row.left)).toBe('b')
    expect(text(row.right)).toBe('B')
  })
})
