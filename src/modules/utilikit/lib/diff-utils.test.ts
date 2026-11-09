import { describe, expect, it } from 'vitest';
import {
  buildDiffRows,
  calculateDiffStats,
  diffTexts,
  toSplitRows,
  type DiffLine,
  type DiffRow,
  type DiffRowOptions,
} from '@/modules/utilikit/lib/diff-utils';

const stats = (oldText: string, newText: string) => calculateDiffStats(diffTexts(oldText, newText));
const rows = (oldText: string, newText: string, options: DiffRowOptions = {}) =>
  buildDiffRows(diffTexts(oldText, newText), options);
const onlyLines = (list: DiffRow[]) => list.filter((row): row is DiffLine => row.type !== 'collapsed');
const lineText = (line: DiffLine) => line.segments.map(segment => segment.text).join('');
const summary = (oldText: string, newText: string) =>
  onlyLines(rows(oldText, newText)).map(line => [line.type, line.oldNumber, line.newNumber, lineText(line)]);
const numbered = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `line ${index + from}`).join('\n');

describe('diffTexts and calculateDiffStats', () => {
  it('reports no changes for identical texts', () => {
    expect(stats('a\nb\nc', 'a\nb\nc')).toEqual({ additions: 0, deletions: 0, unchanged: 3, changes: 0, totalLines: 3 });
    expect(summary('a\nb\nc', 'a\nb\nc')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['unchanged', 2, 2, 'b'],
      ['unchanged', 3, 3, 'c'],
    ]);
  });

  it('counts pure additions', () => {
    expect(stats('a\nb', 'a\nb\nc\nd')).toEqual({ additions: 2, deletions: 0, unchanged: 2, changes: 2, totalLines: 4 });
    expect(summary('a\nb', 'a\nb\nc\nd')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['unchanged', 2, 2, 'b'],
      ['added', null, 3, 'c'],
      ['added', null, 4, 'd'],
    ]);
  });

  it('counts pure deletions', () => {
    expect(stats('a\nb\nc', 'a\nc')).toEqual({ additions: 0, deletions: 1, unchanged: 2, changes: 1, totalLines: 3 });
    expect(summary('a\nb\nc', 'a\nc')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['removed', 2, null, 'b'],
      ['unchanged', 3, 2, 'c'],
    ]);
  });

  it('counts a modified line as one deletion and one addition', () => {
    expect(stats('one\ntwo\nthree', 'one\n2\nthree')).toEqual({
      additions: 1,
      deletions: 1,
      unchanged: 2,
      changes: 2,
      totalLines: 3,
    });
    expect(summary('one\ntwo\nthree', 'one\n2\nthree')).toEqual([
      ['unchanged', 1, 1, 'one'],
      ['removed', 2, null, 'two'],
      ['added', null, 2, '2'],
      ['unchanged', 3, 3, 'three'],
    ]);
  });

  it('counts the last line even when it has no trailing newline', () => {
    expect(stats('a', 'b')).toEqual({ additions: 1, deletions: 1, unchanged: 0, changes: 2, totalLines: 1 });
  });

  it('uses the longer text for the total line count', () => {
    expect(stats(numbered(10), numbered(4)).totalLines).toBe(10);
    expect(stats(numbered(4), numbered(10)).totalLines).toBe(10);
    expect(stats('a\nb\nc', 'x\ny').totalLines).toBe(3);
  });

  it('ignores a missing newline at the end of either text', () => {
    expect(stats('a\nb', 'a\nb\n').changes).toBe(0);
    expect(stats('a\nb\n', 'a\nb').changes).toBe(0);
    expect(summary('a', 'a\nb')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['added', null, 2, 'b'],
    ]);
  });

  it('still reports an extra blank line at the end', () => {
    expect(summary('a\n', 'a\n\n')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['added', null, 2, ''],
    ]);
  });

  it('handles empty inputs', () => {
    expect(stats('', '')).toEqual({ additions: 0, deletions: 0, unchanged: 0, changes: 0, totalLines: 0 });
    expect(rows('', '')).toEqual([]);
    expect(stats('', 'x\ny')).toEqual({ additions: 2, deletions: 0, unchanged: 0, changes: 2, totalLines: 2 });
    expect(summary('', 'x\ny')).toEqual([
      ['added', null, 1, 'x'],
      ['added', null, 2, 'y'],
    ]);
    expect(summary('x', '')).toEqual([['removed', 1, null, 'x']]);
  });

  it('treats CRLF, CR and LF line endings as equal', () => {
    expect(stats('a\r\nb\r\n', 'a\nb\n').changes).toBe(0);
    expect(stats('a\rb', 'a\nb').changes).toBe(0);
    expect(summary('a\r\nb', 'a\nc')).toEqual([
      ['unchanged', 1, 1, 'a'],
      ['removed', 2, null, 'b'],
      ['added', null, 2, 'c'],
    ]);
  });

  it('agrees with the line counts of both texts and rebuilds them from the rows', () => {
    let seed = 42;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const vocabulary = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const randomLines = () => Array.from({ length: random(12) }, () => vocabulary[random(vocabulary.length)]);
    const toText = (list: string[]) => (list.length ? list.join('\n') + (random(2) ? '\n' : '') : '');

    for (let run = 0; run < 200; run++) {
      const oldLines = randomLines();
      const newLines = randomLines();
      const changes = diffTexts(toText(oldLines), toText(newLines));
      const result = calculateDiffStats(changes);

      expect(result.unchanged + result.deletions).toBe(oldLines.length);
      expect(result.unchanged + result.additions).toBe(newLines.length);
      expect(result.changes).toBe(result.additions + result.deletions);
      expect(result.totalLines).toBe(Math.max(oldLines.length, newLines.length));

      const lines = onlyLines(buildDiffRows(changes, { highlightWords: true }));
      const oldSide = lines.filter(line => line.type !== 'added');
      const newSide = lines.filter(line => line.type !== 'removed');
      expect(oldSide.map(lineText)).toEqual(oldLines);
      expect(newSide.map(lineText)).toEqual(newLines);
      expect(oldSide.map(line => line.oldNumber)).toEqual(oldLines.map((_, index) => index + 1));
      expect(newSide.map(line => line.newNumber)).toEqual(newLines.map((_, index) => index + 1));
    }
  });
});

describe('buildDiffRows', () => {
  it('collapses long unchanged runs and keeps the line numbers after the gap', () => {
    const result = rows(`${numbered(10)}\nold`, `${numbered(10)}\nnew`, { collapseUnchanged: true });
    expect(result.map(row => (row.type === 'collapsed' ? `hidden ${row.count}` : row.oldNumber))).toEqual([
      1,
      2,
      3,
      'hidden 4',
      8,
      9,
      10,
      11,
      null,
    ]);
    expect(onlyLines(result).map(lineText).slice(3, 6)).toEqual(['line 8', 'line 9', 'line 10']);
  });

  it('does not collapse runs of six lines or fewer', () => {
    const result = rows(`${numbered(6)}\nold`, `${numbered(6)}\nnew`, { collapseUnchanged: true });
    expect(result.some(row => row.type === 'collapsed')).toBe(false);
    expect(result).toHaveLength(8);
  });

  it('leaves unchanged runs alone when collapsing is off', () => {
    expect(rows(numbered(20), numbered(20)).every(row => row.type === 'unchanged')).toBe(true);
  });

  it('marks only the changed words when word highlighting is on', () => {
    const [removed, added] = onlyLines(rows('The quick brown fox', 'The quick red fox', { highlightWords: true }));
    expect(removed.segments).toEqual([
      { text: 'The quick ', changed: false },
      { text: 'brown', changed: true },
      { text: ' fox', changed: false },
    ]);
    expect(added.segments).toEqual([
      { text: 'The quick ', changed: false },
      { text: 'red', changed: true },
      { text: ' fox', changed: false },
    ]);
  });

  it('keeps word highlights on the right line in multi-line changes', () => {
    const lines = onlyLines(rows('let a = 1;\nlet b = 2;', 'const a = 1;\nconst b = 3;', { highlightWords: true }));
    const changedWords = (line: DiffLine) => line.segments.filter(segment => segment.changed).map(segment => segment.text);

    expect(lines.map(line => [line.type, lineText(line)])).toEqual([
      ['removed', 'let a = 1;'],
      ['removed', 'let b = 2;'],
      ['added', 'const a = 1;'],
      ['added', 'const b = 3;'],
    ]);
    expect(lines.map(changedWords)).toEqual([['let'], ['let', '2'], ['const'], ['const', '3']]);
  });

  it('returns whole lines without word marks when word highlighting is off', () => {
    const [removed, added] = onlyLines(rows('The quick brown fox', 'The quick red fox'));
    expect(removed.segments).toEqual([{ text: 'The quick brown fox', changed: false }]);
    expect(added.segments).toEqual([{ text: 'The quick red fox', changed: false }]);
  });

  it('falls back to whole lines when a rewrite is too large for word diffing', () => {
    const oldLine = Array.from({ length: 200 }, (_, index) => `a${index}`).join(' ');
    const newLine = Array.from({ length: 200 }, (_, index) => `b${index}`).join(' ');
    const [removed, added] = onlyLines(rows(oldLine, newLine, { highlightWords: true }));
    expect(removed.segments).toEqual([{ text: oldLine, changed: false }]);
    expect(added.segments).toEqual([{ text: newLine, changed: false }]);
  });

  it('gives empty lines no segments', () => {
    const [, blank] = onlyLines(rows('a\n\nb', 'a\n\nb'));
    expect(blank.segments).toEqual([]);
    expect(blank.oldNumber).toBe(2);
  });
});

describe('toSplitRows', () => {
  it('pairs removed and added lines and pads the shorter side', () => {
    const split = toSplitRows(rows('keep\nold 1\nold 2\nend', 'keep\nnew 1\nnew 2\nnew 3\nend'));
    expect(
      split.map(row =>
        row.type === 'split'
          ? [row.left && `${row.left.oldNumber}:${lineText(row.left)}`, row.right && `${row.right.newNumber}:${lineText(row.right)}`]
          : row.count
      )
    ).toEqual([
      ['1:keep', '1:keep'],
      ['2:old 1', '2:new 1'],
      ['3:old 2', '3:new 2'],
      [null, '4:new 3'],
      ['4:end', '5:end'],
    ]);
  });

  it('keeps pure deletions on the left only', () => {
    const split = toSplitRows(rows('a\nb\nc', 'a\nc'));
    expect(split[1]).toMatchObject({ type: 'split', left: { type: 'removed', oldNumber: 2 }, right: null });
    expect(split).toHaveLength(3);
  });

  it('passes collapsed runs through unchanged', () => {
    const split = toSplitRows(rows(`${numbered(10)}\nold`, `${numbered(10)}\nnew`, { collapseUnchanged: true }));
    expect(split.filter(row => row.type === 'collapsed')).toEqual([{ type: 'collapsed', count: 4 }]);
    expect(split).toHaveLength(8);
  });
});
