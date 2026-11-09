import { describe, expect, it } from 'vitest';
import { captureGroupNames, highlightParts, MAX_MATCHES, testRegex } from '@/modules/utilikit/lib/regex-tester';

describe('captureGroupNames', () => {
  it('lists capture groups in order with their names', () => {
    expect(captureGroupNames('(\\d+)-(?<month>\\d+)-(?:x)(?<day>\\d+)')).toEqual([undefined, 'month', 'day']);
  });

  it('ignores lookarounds, escaped parentheses and character classes', () => {
    expect(captureGroupNames('\\((?=a)(?!b)(?<=c)(?<!d)[()](e)')).toEqual([undefined]);
    expect(captureGroupNames('[\\]()](x)')).toEqual([undefined]);
    expect(captureGroupNames('[^](y)[]](z)')).toEqual([undefined, undefined]);
  });
});

describe('testRegex', () => {
  it('finds every match with the global flag', () => {
    const result = testRegex('\\d+', 'g', 'a1 b22 c333');
    expect(result.ok && result.matches.map(match => [match.value, match.start, match.end])).toEqual([
      ['1', 1, 2],
      ['22', 4, 6],
      ['333', 8, 11],
    ]);
  });

  it('finds only the first match without it', () => {
    const result = testRegex('\\d+', '', 'a1 b22');
    expect(result.ok && result.matches.map(match => match.value)).toEqual(['1']);
  });

  it('reports numbered and named groups with their positions', () => {
    const result = testRegex('(?<year>\\d{4})-(\\d{2})', 'g', 'on 2024-05 and 1999-12');
    expect(result.ok && result.matches[1].groups).toEqual([
      { index: 1, name: 'year', value: '1999', start: 15, end: 19 },
      { index: 2, name: undefined, value: '12', start: 20, end: 22 },
    ]);
  });

  it('keeps groups that did not take part in the match', () => {
    const result = testRegex('a(b)?', '', 'a');
    expect(result.ok && result.matches[0].groups).toEqual([
      { index: 1, name: undefined, value: undefined, start: undefined, end: undefined },
    ]);
  });

  it('handles empty matches without looping forever', () => {
    const result = testRegex('x*', 'g', 'abc');
    expect(result.ok && result.matches).toHaveLength(4);
  });

  it('stops after the maximum number of matches', () => {
    const result = testRegex('.', 'g', 'a'.repeat(MAX_MATCHES + 5));
    expect(result.ok && result.matches).toHaveLength(MAX_MATCHES);
    expect(result.ok && result.truncated).toBe(true);
  });

  it('applies the replacement with the chosen flags', () => {
    expect(testRegex('(\\w+)@(\\w+)', 'g', 'ann@home bob@work', '$2:$1')).toMatchObject({ replaced: 'home:ann work:bob' });
    expect(testRegex('(?<word>o)', '', 'foo', '[$<word>]')).toMatchObject({ replaced: 'f[o]o' });
  });

  it('returns the error for an invalid pattern', () => {
    const result = testRegex('(unclosed', 'g', 'text');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Unterminated group|missing \)/i);
    expect(!result.ok && result.error).not.toContain('/dg');
  });

  it('supports unicode property escapes with the u flag', () => {
    const result = testRegex('\\p{Lu}', 'gu', 'aBcÑ');
    expect(result.ok && result.matches.map(match => match.value)).toEqual(['B', 'Ñ']);
  });
});

describe('highlightParts', () => {
  it('splits the text around the matches', () => {
    const result = testRegex('o+', 'g', 'foo bar boo');
    expect(result.ok && highlightParts('foo bar boo', result.matches)).toEqual([
      { text: 'f' },
      { text: 'oo', match: 0 },
      { text: ' bar b' },
      { text: 'oo', match: 1 },
    ]);
  });

  it('keeps empty matches as markers', () => {
    const result = testRegex('^', 'gm', 'a\nb');
    expect(result.ok && highlightParts('a\nb', result.matches)).toEqual([
      { text: '', match: 0 },
      { text: 'a\n' },
      { text: '', match: 1 },
      { text: 'b' },
    ]);
  });
});
