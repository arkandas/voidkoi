import { diffLines, diffWordsWithSpace, type Change } from 'diff';

const CONTEXT_LINES = 3;
const MAX_WORD_EDITS = 300;

export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
  changes: number;
  totalLines: number;
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  type: 'unchanged' | 'removed' | 'added';
  oldNumber: number | null;
  newNumber: number | null;
  segments: DiffSegment[];
}

export interface CollapsedLines {
  type: 'collapsed';
  count: number;
}

export type DiffRow = DiffLine | CollapsedLines;

export interface SplitLine {
  type: 'split';
  left: DiffLine | null;
  right: DiffLine | null;
}

export type SplitRow = SplitLine | CollapsedLines;

export interface DiffRowOptions {
  highlightWords?: boolean;
  collapseUnchanged?: boolean;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function diffTexts(oldText: string, newText: string): Change[] {
  return diffLines(normalizeLineEndings(oldText), normalizeLineEndings(newText), { ignoreNewlineAtEof: true });
}

export function calculateDiffStats(changes: Change[]): DiffStats {
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const change of changes) {
    if (change.added) {
      additions += change.count;
    } else if (change.removed) {
      deletions += change.count;
    } else {
      unchanged += change.count;
    }
  }

  return {
    additions,
    deletions,
    unchanged,
    changes: additions + deletions,
    totalLines: unchanged + Math.max(additions, deletions),
  };
}

function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (value.endsWith('\n')) lines.pop();
  return lines;
}

function plainSegments(text: string): DiffSegment[] {
  return text ? [{ text, changed: false }] : [];
}

function toLineSegments(parts: Change[], isChanged: (part: Change) => boolean): DiffSegment[][] {
  const lines: DiffSegment[][] = [[]];

  for (const part of parts) {
    const changed = isChanged(part);
    part.value.split('\n').forEach((text, index) => {
      if (index > 0) lines.push([]);
      if (!text) return;

      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last?.changed === changed) {
        last.text += text;
      } else {
        line.push({ text, changed });
      }
    });
  }

  return lines;
}

function wordSegments(oldLines: string[], newLines: string[]): [DiffSegment[][], DiffSegment[][]] | null {
  const parts = diffWordsWithSpace(oldLines.join('\n'), newLines.join('\n'), { maxEditLength: MAX_WORD_EDITS });
  if (!parts) return null;

  return [
    toLineSegments(parts.filter(part => !part.added), part => part.removed),
    toLineSegments(parts.filter(part => !part.removed), part => part.added),
  ];
}

export function buildDiffRows(changes: Change[], options: DiffRowOptions = {}): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNumber = 1;
  let newNumber = 1;
  let index = 0;

  while (index < changes.length) {
    const change = changes[index];

    if (!change.added && !change.removed) {
      const lines = splitLines(change.value);
      const hidden = options.collapseUnchanged ? Math.max(lines.length - CONTEXT_LINES * 2, 0) : 0;

      lines.forEach((text, line) => {
        if (hidden && line === CONTEXT_LINES) rows.push({ type: 'collapsed', count: hidden });
        if (hidden && line >= CONTEXT_LINES && line < CONTEXT_LINES + hidden) return;
        rows.push({ type: 'unchanged', oldNumber: oldNumber + line, newNumber: newNumber + line, segments: plainSegments(text) });
      });

      oldNumber += lines.length;
      newNumber += lines.length;
      index++;
      continue;
    }

    const removed: string[] = [];
    const added: string[] = [];
    for (; index < changes.length && (changes[index].added || changes[index].removed); index++) {
      const target = changes[index].added ? added : removed;
      for (const line of splitLines(changes[index].value)) target.push(line);
    }

    const words = options.highlightWords && removed.length && added.length ? wordSegments(removed, added) : null;

    removed.forEach((text, line) => {
      rows.push({ type: 'removed', oldNumber: oldNumber + line, newNumber: null, segments: words?.[0][line] ?? plainSegments(text) });
    });
    added.forEach((text, line) => {
      rows.push({ type: 'added', oldNumber: null, newNumber: newNumber + line, segments: words?.[1][line] ?? plainSegments(text) });
    });

    oldNumber += removed.length;
    newNumber += added.length;
  }

  return rows;
}

export function toSplitRows(rows: DiffRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];

  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++) {
      result.push({ type: 'split', left: removed[index] ?? null, right: added[index] ?? null });
    }
    removed = [];
    added = [];
  };

  for (const row of rows) {
    if (row.type === 'removed') {
      removed.push(row);
    } else if (row.type === 'added') {
      added.push(row);
    } else {
      flush();
      result.push(row.type === 'collapsed' ? row : { type: 'split', left: row, right: row });
    }
  }
  flush();

  return result;
}
