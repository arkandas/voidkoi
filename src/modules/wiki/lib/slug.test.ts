import { describe, expect, it } from 'vitest';
import { isSlug, RESERVED_SLUGS, slugify, uniqueSlug } from '@/modules/wiki/lib/slug';

describe('slugify', () => {
  it('makes a lowercase address out of a title, accents dropped', () => {
    expect(slugify('Getting Started: Á primer')).toBe('getting-started-a-primer');
    expect(slugify('Configuración del NAS (2026)')).toBe('configuracion-del-nas-2026');
  });

  it('never gives an empty address', () => {
    expect(slugify('¿?')).toBe('page');
    expect(slugify('   ')).toBe('page');
  });

  it('keeps addresses short, without a dash at the end', () => {
    const slug = slugify('word '.repeat(60));
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('numbers an address that is taken', () => {
    expect(uniqueSlug('notes', new Set(['notes', 'notes-2']), false)).toBe('notes-3');
  });

  it('keeps the wiki’s own addresses for the wiki at the top level', () => {
    expect(uniqueSlug('admin', new Set(), true)).toBe('admin-2');
    expect(uniqueSlug('admin', new Set(), false)).toBe('admin');
    expect(RESERVED_SLUGS.has('api')).toBe(true);
  });
});

describe('isSlug', () => {
  it('accepts lowercase words joined by dashes', () => {
    expect(isSlug('my-page-2')).toBe(true);
    expect(isSlug('My-Page')).toBe(false);
    expect(isSlug('-start')).toBe(false);
    expect(isSlug('a--b')).toBe(false);
    expect(isSlug('a/b')).toBe(false);
  });
});
