import { describe, expect, it } from 'vitest';
import { firstLine, plainText, snippet } from './search-text';

describe('plainText', () => {
  it('strips markdown markers and keeps the words', () => {
    expect(plainText('## Title\n\n- [x] **Done** item\n- [ ] `code` and ~~gone~~')).toBe('Title Done item code and gone');
  });

  it('keeps the label of a link and drops the address', () => {
    expect(plainText('See the [style guide](https://example.com).')).toBe('See the style guide.');
  });

  it('drops list numbers and quote markers', () => {
    expect(plainText('1. First\n2. Second\n> Quoted')).toBe('First Second Quoted');
  });
});

describe('snippet', () => {
  it('returns the text around a match, ignoring case', () => {
    expect(snippet('Validation and the `success` state.', 'SUCCESS')).toBe('Validation and the success state.');
  });

  it('marks text cut off at the start, and starts on a whole word', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank';
    expect(snippet(text, 'river')).toBe('…the lazy dog near the river bank');
  });

  it('still shows a match that sits inside a long word', () => {
    expect(snippet(`${'x'.repeat(40)}needle`, 'needle')).toBe(`…${'x'.repeat(24)}needle`);
  });

  it('returns null without text or without a match', () => {
    expect(snippet(null, 'x')).toBeNull();
    expect(snippet('Nothing here', 'absent')).toBeNull();
  });
});

describe('firstLine', () => {
  it('uses the first line of a note, without markdown', () => {
    expect(firstLine('**Standup** at 9:30\n\nRoom 2')).toBe('Standup at 9:30');
  });

  it('is empty for a note that has no text', () => {
    expect(firstLine('   ')).toBe('');
  });
});

