import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { plainText, snippet } from '@/modules/wiki/lib/search';

describe('plainText', () => {
  it('keeps the words of Markdown and drops its marks', () => {
    const text = plainText('# Title\n\nSome **bold** and [a link](/x).\n\n```js\ncode()\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n:::note\nHi\n:::');
    expect(text).toContain('Title Some bold and a link.');
    expect(text).not.toContain('code()');
    expect(text).not.toContain('---');
    expect(text).not.toContain(':::');
  });
});

describe('plainText on hostile pages', () => {
  it('stays quick on long runs of blank lines and stray brackets', () => {
    const started = Date.now()
    plainText('\n'.repeat(200_000))
    plainText('<'.repeat(200_000))
    plainText('!['.repeat(100_000))
    plainText('# '.repeat(100_000))
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('snippet', () => {
  it('marks the match in the words around it', () => {
    const text = 'one two three four five six seven eight nine ten '.repeat(10);
    const result = snippet(text, 'FIVE')!;
    expect(result).toContain('‹five›');
    expect(result.length).toBeLessThan(200);
  });

  it('has nothing when the text doesn’t match', () => {
    expect(snippet('nothing here', 'missing')).toBeNull();
  });
});
