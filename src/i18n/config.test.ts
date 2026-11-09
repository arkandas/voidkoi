import { describe, expect, it } from 'vitest';
import { defaultLocale, isLocale, resolveLocale } from '@/i18n/config';

describe('resolveLocale', () => {
  it('prefers a valid cookie over the browser language', () => {
    expect(resolveLocale('es', 'en-US,en;q=0.9')).toBe('es');
    expect(resolveLocale('en', 'es-ES,es;q=0.9')).toBe('en');
  });

  it('ignores an invalid cookie', () => {
    expect(resolveLocale('fr', 'es-ES')).toBe('es');
  });

  it('matches the browser language by its primary subtag', () => {
    expect(resolveLocale(undefined, 'es-MX')).toBe('es');
    expect(resolveLocale(undefined, 'EN-gb')).toBe('en');
  });

  it('respects quality values', () => {
    expect(resolveLocale(undefined, 'en;q=0.4, es;q=0.8')).toBe('es');
    expect(resolveLocale(undefined, 'fr-FR, es;q=0.5, en;q=0.9')).toBe('en');
  });

  it('skips unsupported languages and zero-quality entries', () => {
    expect(resolveLocale(undefined, 'fr, de;q=0.9, es;q=0.1')).toBe('es');
    expect(resolveLocale(undefined, 'es;q=0, en;q=0.1')).toBe('en');
  });

  it('falls back to the default locale', () => {
    expect(resolveLocale(null, null)).toBe(defaultLocale);
    expect(resolveLocale(undefined, 'fr, de')).toBe(defaultLocale);
    expect(resolveLocale(undefined, '*')).toBe(defaultLocale);
  });
});

describe('isLocale', () => {
  it('only accepts supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('es-ES')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
