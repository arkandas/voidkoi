import { describe, expect, it } from 'vitest';
import { slugify } from './export';

describe('slugify', () => {
  it('makes a filename out of a title', () => {
    expect(slugify('My Note: part 2')).toBe('my-note-part-2');
  });

  it('collapses runs of punctuation rather than leaving dashes everywhere', () => {
    expect(slugify('a  --  b')).toBe('a-b');
  });

  it('trims the dashes off both ends', () => {
    expect(slugify('!!! hello !!!')).toBe('hello');
  });

  it('drops accents and symbols a filesystem would rather not see', () => {
    expect(slugify('Résumé (2026) — final/draft')).toBe('resume-2026-final-draft');
    expect(slugify('Sin título: año 2026, señales')).toBe('sin-titulo-ano-2026-senales');
  });

  it('falls back rather than returning an empty filename', () => {
    expect(slugify('***')).toBe('untitled');
    expect(slugify('')).toBe('untitled');
  });
});
