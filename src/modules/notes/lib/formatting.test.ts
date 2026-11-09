import { describe, expect, it } from 'vitest'
import { applyEdit, wrapSelection, type Wrap } from './formatting'

const BOLD: Wrap = { kind: 'inline', before: '**', after: '**' }
const LIST: Wrap = { kind: 'prefix', marker: '- ' }
const HEADING: Wrap = { kind: 'heading' }

/** The text after the edit, with the selection marked by [ and ]. */
function run(text: string, tool: Wrap): string {
  const start = text.indexOf('[')
  const end = text.indexOf(']') - 1
  const value = text.replace('[', '').replace(']', '')
  const edit = wrapSelection(value, start, end, tool)
  const after = applyEdit(value, edit)
  return after.slice(0, edit.selStart) + '[' + after.slice(edit.selStart, edit.selEnd) + ']' + after.slice(edit.selEnd)
}

describe('inline marks', () => {
  it('wrap the selection and keep it selected', () => {
    expect(run('a [word] here', BOLD)).toBe('a **[word]** here')
  })

  it('wrap the word under the cursor when nothing is selected', () => {
    expect(run('a wo[]rd here', BOLD)).toBe('a **[word]** here')
  })

  it('come off a selection that has them inside', () => {
    expect(run('a [**word**] here', BOLD)).toBe('a [word] here')
  })

  it('come off a selection that has them around it', () => {
    expect(run('a **[word]** here', BOLD)).toBe('a [word] here')
  })
})

describe('line marks', () => {
  it('go on every selected line, skipping blank ones', () => {
    expect(run('[one\n\ntwo]', LIST)).toBe('[- one\n\n- two]')
  })

  it('come off when every line has them', () => {
    expect(run('[- one\n- two]', LIST)).toBe('[one\ntwo]')
  })

  it('keep the cursor where it was in the line', () => {
    expect(run('on[]e', LIST)).toBe('- on[]e')
  })
})

describe('headings', () => {
  it('step from none to three and back to none', () => {
    expect(run('Ti[]tle', HEADING)).toBe('# Ti[]tle')
    expect(run('# Ti[]tle', HEADING)).toBe('## Ti[]tle')
    expect(run('### Ti[]tle', HEADING)).toBe('Ti[]tle')
  })
})
