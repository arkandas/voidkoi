import { diffLines, diffWordsWithSpace } from 'diff'

export interface Part {
  text: string
  /** Changed between the two versions of this line. */
  changed: boolean
}

export interface DiffLine {
  kind: 'same' | 'added' | 'removed'
  /** Line numbers in the older and newer text; null on the side the line isn't on. */
  oldNumber: number | null
  newNumber: number | null
  parts: Part[]
}

export interface Gap {
  kind: 'gap'
  /** Unchanged lines left out between two changes. */
  count: number
}

export interface Row {
  left: DiffLine | null
  right: DiffLine | null
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** Which words changed between a removed line and the added line that replaced it. */
function wordParts(before: string, after: string): [Part[], Part[]] {
  const left: Part[] = []
  const right: Part[] = []
  for (const change of diffWordsWithSpace(before, after)) {
    if (!change.added) left.push({ text: change.value, changed: !!change.removed })
    if (!change.removed) right.push({ text: change.value, changed: !!change.added })
  }
  return [left, right]
}

/** Every line of both texts, in order, marked same, removed or added, with changed words picked out. */
export function diffText(older: string, newer: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldNumber = 1
  let newNumber = 1
  const changes = diffLines(older, newer)
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!
    const text = splitLines(change.value)
    if (!change.added && !change.removed) {
      for (const line of text) lines.push({ kind: 'same', oldNumber: oldNumber++, newNumber: newNumber++, parts: [{ text: line, changed: false }] })
      continue
    }
    const next = changes[i + 1]
    if (change.removed && next?.added) {
      // Removed then added: lines that were edited. Pair them up to show which words changed.
      const added = splitLines(next.value)
      const paired = Math.min(text.length, added.length)
      const removedLines: DiffLine[] = []
      const addedLines: DiffLine[] = []
      for (let j = 0; j < Math.max(text.length, added.length); j++) {
        if (j < paired) {
          const [left, right] = wordParts(text[j]!, added[j]!)
          removedLines.push({ kind: 'removed', oldNumber: oldNumber++, newNumber: null, parts: left })
          addedLines.push({ kind: 'added', oldNumber: null, newNumber: newNumber++, parts: right })
        } else if (j < text.length) {
          removedLines.push({ kind: 'removed', oldNumber: oldNumber++, newNumber: null, parts: [{ text: text[j]!, changed: false }] })
        } else {
          addedLines.push({ kind: 'added', oldNumber: null, newNumber: newNumber++, parts: [{ text: added[j]!, changed: false }] })
        }
      }
      lines.push(...removedLines, ...addedLines)
      i++
      continue
    }
    for (const line of text) {
      lines.push(
        change.added
          ? { kind: 'added', oldNumber: null, newNumber: newNumber++, parts: [{ text: line, changed: false }] }
          : { kind: 'removed', oldNumber: oldNumber++, newNumber: null, parts: [{ text: line, changed: false }] },
      )
    }
  }
  return lines
}

/** Long stretches of unchanged lines folded away, keeping `context` lines around each change. */
export function collapse(lines: DiffLine[], context = 3): Array<DiffLine | Gap> {
  const near = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (let at = Math.max(0, index - context); at <= Math.min(lines.length - 1, index + context); at++) near[at] = true
  })
  const out: Array<DiffLine | Gap> = []
  let hidden = 0
  lines.forEach((line, index) => {
    if (near[index]) {
      if (hidden) out.push({ kind: 'gap', count: hidden })
      hidden = 0
      out.push(line)
    } else hidden++
  })
  if (hidden) out.push({ kind: 'gap', count: hidden })
  return out
}

/** The same lines as two columns: older on the left, newer on the right, edits side by side. */
export function sideBySide(items: Array<DiffLine | Gap>): Array<Row | Gap> {
  const rows: Array<Row | Gap> = []
  let removed: DiffLine[] = []
  let added: DiffLine[] = []
  const flush = (): void => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) rows.push({ left: removed[i] ?? null, right: added[i] ?? null })
    removed = []
    added = []
  }
  for (const item of items) {
    if (item.kind === 'removed') {
      if (added.length) flush()
      removed.push(item)
    } else if (item.kind === 'added') added.push(item)
    else {
      flush()
      rows.push(item.kind === 'gap' ? item : { left: item, right: item })
    }
  }
  flush()
  return rows
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter(line => line.kind === 'added').length,
    removed: lines.filter(line => line.kind === 'removed').length,
  }
}
