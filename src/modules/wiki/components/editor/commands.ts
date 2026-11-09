import { EditorSelection, type ChangeSpec, type EditorState, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * What the toolbar and the shortcuts do to the text. Each works on every
 * selection at once and leaves the cursor where the next word goes.
 */

export type Dispatch = (transaction: Transaction) => void;

/** `**bold**` around the selection, or around the word the cursor is in; again to take it off. */
export function toggleWrap(state: EditorState, before: string, after = before): Transaction {
  return state.update(
    state.changeByRange(range => {
      let { from, to } = range;
      if (from === to) {
        const word = state.wordAt(from);
        if (word) ({ from, to } = word);
      }
      const inside = state.sliceDoc(from, to);
      const outerFrom = from - before.length;
      const outerTo = to + after.length;
      const wrapped = outerFrom >= 0 && state.sliceDoc(outerFrom, from) === before && state.sliceDoc(to, outerTo) === after;
      if (wrapped) {
        return {
          changes: [
            { from: outerFrom, to: from, insert: '' },
            { from: to, to: outerTo, insert: '' },
          ],
          range: EditorSelection.range(outerFrom, outerFrom + inside.length),
        };
      }
      if (inside.startsWith(before) && inside.endsWith(after) && inside.length >= before.length + after.length) {
        const unwrapped = inside.slice(before.length, inside.length - after.length);
        return { changes: { from, to, insert: unwrapped }, range: EditorSelection.range(from, from + unwrapped.length) };
      }
      return {
        changes: { from, to, insert: `${before}${inside}${after}` },
        range: EditorSelection.range(from + before.length, from + before.length + inside.length),
      };
    }),
    { scrollIntoView: true, userEvent: 'input' },
  );
}

/** The lines the selections touch, each once. */
function selectedLines(state: EditorState) {
  const seen = new Set<number>();
  const lines = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number++) {
      if (seen.has(number)) continue;
      seen.add(number);
      lines.push(state.doc.line(number));
    }
  }
  return lines;
}

const LIST_MARKER = /^(\s*)(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )/;

/**
 * Start every selected line with `marker` ("- ", "1. ", "- [ ] ", "> "), or
 * take it off when they all have it. A line keeps its indent; another kind of
 * marker is swapped for this one.
 */
export function toggleLinePrefix(state: EditorState, marker: string): Transaction {
  const lines = selectedLines(state).filter(line => line.text.trim() !== '' || state.selection.ranges.length === 1);
  const numbered = marker === '1. ';
  const has = (text: string) => (numbered ? /^\s*\d+[.)] /.test(text) : text.trimStart().startsWith(marker));
  const all = lines.length > 0 && lines.every(line => has(line.text));
  const changes: ChangeSpec[] = [];
  lines.forEach((line, index) => {
    const indent = /^\s*/.exec(line.text)![0];
    const existing = LIST_MARKER.exec(line.text);
    const from = line.from + indent.length;
    const to = existing ? line.from + existing[0].length : from;
    if (all) changes.push({ from, to, insert: '' });
    else changes.push({ from, to, insert: numbered ? `${index + 1}. ` : marker });
  });
  return state.update({ changes, scrollIntoView: true, userEvent: 'input' });
}

/** Cycle the line through ## , ### and plain text. */
export function cycleHeading(state: EditorState): Transaction {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(state)) {
    const match = /^(#{1,6}) /.exec(line.text);
    const level = match ? match[1]!.length : 0;
    const next = level === 0 ? 2 : level === 2 ? 3 : 0;
    changes.push({ from: line.from, to: line.from + (match ? match[0].length : 0), insert: next ? `${'#'.repeat(next)} ` : '' });
  }
  return state.update({ changes, scrollIntoView: true, userEvent: 'input' });
}

/**
 * Put a block on lines of its own: blank lines around it unless they're
 * already there. `select` is the part of the block to leave selected, as an
 * offset and length within it.
 */
export function insertBlock(state: EditorState, block: string, select?: { at: number; length: number }): Transaction {
  const range = state.selection.main;
  const before = state.sliceDoc(Math.max(0, range.from - 2), range.from);
  const after = state.sliceDoc(range.to, range.to + 2);
  const lead = range.from === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : range.to === state.doc.length ? '\n' : '\n\n';
  const insert = `${lead}${block}${tail}`;
  const start = range.from + lead.length;
  const selection = select
    ? EditorSelection.single(start + select.at, start + select.at + select.length)
    : EditorSelection.cursor(start + block.length);
  return state.update({ changes: { from: range.from, to: range.to, insert }, selection, scrollIntoView: true, userEvent: 'input' });
}

/** A fenced code block around the selected lines, or an empty one. */
export function codeBlock(state: EditorState): Transaction {
  const range = state.selection.main;
  if (range.empty) return insertBlock(state, '```\n\n```', { at: 4, length: 0 });
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const text = state.sliceDoc(first.from, last.to);
  return state.update({
    changes: { from: first.from, to: last.to, insert: `\`\`\`\n${text}\n\`\`\`` },
    selection: EditorSelection.cursor(first.from + 3),
    scrollIntoView: true,
    userEvent: 'input',
  });
}

/** `[selection](url)` with "url" selected to type over; or `[text](url)` with "text" selected. */
export function link(state: EditorState, placeholder: string): Transaction {
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  if (/^https?:\/\/\S+$/.test(text)) {
    const insert = `[${placeholder}](${text})`;
    return state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.single(range.from + 1, range.from + 1 + placeholder.length),
      scrollIntoView: true,
      userEvent: 'input',
    });
  }
  const label = text || placeholder;
  const insert = `[${label}](url)`;
  const urlAt = range.from + label.length + 3;
  return state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: text ? EditorSelection.single(urlAt, urlAt + 3) : EditorSelection.single(range.from + 1, range.from + 1 + label.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
}

/** A link to another page of the wiki, named after it unless text is selected. */
export function pageLink(state: EditorState, title: string, path: string): Transaction {
  const range = state.selection.main;
  const label = state.sliceDoc(range.from, range.to) || title;
  const insert = `[${label}](/wiki/${path})`;
  return state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
}

/** Text put in at a place (where an image was dropped), or over the selection. */
export function insertAt(state: EditorState, text: string, at?: number): Transaction {
  const from = at ?? state.selection.main.from;
  const to = at ?? state.selection.main.to;
  return state.update({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
}

export function run(view: EditorView | null, make: (state: EditorState) => Transaction): boolean {
  if (!view) return false;
  view.dispatch(make(view.state));
  view.focus();
  return true;
}


/** A table to fill in, with its words in the reader's language. */
export function table(column: string, cell: string): string {
  return `| ${column} | ${column} |\n| --- | --- |\n| ${cell} | ${cell} |`;
}

/** A picture on a line of its own: where it was dropped, or at the cursor. */
export function insertImage(state: EditorState, markdown: string, at: number | null): Transaction {
  const position = at ?? state.selection.main.head;
  const line = state.doc.lineAt(position);
  const lead = line.text.trim() === '' ? '' : position === line.from ? '' : '\n\n';
  const tail = line.text.trim() === '' || position === line.to ? '\n' : '\n\n';
  const insert = `${lead}${markdown}${tail}`;
  return state.update({
    changes: { from: position, to: at === null ? state.selection.main.to : position, insert },
    selection: EditorSelection.cursor(position + insert.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
}
