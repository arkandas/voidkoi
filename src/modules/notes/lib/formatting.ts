/** What a toolbar button does to the text. */
export type Wrap =
  | { kind: 'inline'; before: string; after: string }
  | { kind: 'prefix'; marker: string }
  | { kind: 'heading' }

/** Replace `from`–`to` with `text`, then select `selStart`–`selEnd`. */
export interface Edit {
  from: number
  to: number
  text: string
  selStart: number
  selEnd: number
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The edit a formatting button makes. Inline marks wrap the selection, or the
 * word under the cursor, and come off again when already there. Line marks
 * go on every selected line, or come off when all have them. Headings step
 * through levels 1 to 3 and back to none.
 */
export function wrapSelection(value: string, selectionStart: number, selectionEnd: number, tool: Wrap): Edit {
  let start = selectionStart
  let end = selectionEnd

  if (tool.kind === 'inline') {
    const { before, after } = tool

    if (start === end) {
      let wordStart = start
      let wordEnd = end
      while (wordStart > 0 && /\S/.test(value[wordStart - 1])) wordStart--
      while (wordEnd < value.length && /\S/.test(value[wordEnd])) wordEnd++
      if (wordEnd > wordStart) {
        start = wordStart
        end = wordEnd
      }
    }

    const selected = value.slice(start, end)

    if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
      const inner = selected.slice(before.length, selected.length - after.length)
      return { from: start, to: end, text: inner, selStart: start, selEnd: start + inner.length }
    }

    const outerStart = start - before.length
    const outerEnd = end + after.length
    if (outerStart >= 0 && outerEnd <= value.length && value.slice(outerStart, start) === before && value.slice(end, outerEnd) === after) {
      return { from: outerStart, to: outerEnd, text: selected, selStart: outerStart, selEnd: outerStart + selected.length }
    }

    return {
      from: start,
      to: end,
      text: before + selected + after,
      selStart: start + before.length,
      selEnd: start + before.length + selected.length,
    }
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const searchFrom = end > start && value[end - 1] === '\n' ? end - 1 : end
  const lineEnd = value.indexOf('\n', searchFrom) === -1 ? value.length : value.indexOf('\n', searchFrom)
  const lines = value.slice(lineStart, lineEnd).split('\n')

  let next: string[]
  if (tool.kind === 'heading') {
    const level = /^(#{1,6})\s/.exec(lines[0])?.[1].length ?? 0
    const nextLevel = level >= 3 ? 0 : level + 1
    const marker = nextLevel > 0 ? `${'#'.repeat(nextLevel)} ` : ''
    next = lines.map(line => marker + line.replace(/^#{1,6}\s+/, ''))
  } else {
    const { marker } = tool
    const filled = lines.filter(line => line.trim() !== '')
    const allMarked = filled.length > 0 && filled.every(line => line.trimStart().startsWith(marker))
    const strip = new RegExp(`^(\\s*)${escapeRe(marker)}`)
    next = lines.map(line => (line.trim() === '' ? line : allMarked ? line.replace(strip, '$1') : marker + line))
  }

  const text = next.join('\n')
  const firstDelta = next[0].length - lines[0].length
  const [selStart, selEnd] =
    start === end
      ? [Math.max(lineStart, start + firstDelta), Math.max(lineStart, start + firstDelta)]
      : [lineStart, lineStart + text.length]

  return { from: lineStart, to: lineEnd, text, selStart, selEnd }
}

/** Apply an edit to text, as the editor would. */
export function applyEdit(value: string, edit: Edit): string {
  return value.slice(0, edit.from) + edit.text + value.slice(edit.to)
}
