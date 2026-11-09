import { describe, expect, it } from 'vitest';

import {
  CODE_FONTS, DEFAULT_NOTE_SETTINGS, FONT_SIZES, TEXT_FONTS,
  fontFamilies, fontVariables, lineHeightFor, parseNoteSettings, storedNoteSettings,
} from './fonts';

describe('note settings', () => {
  it('start in Lato, with code in Fira Code', () => {
    expect(DEFAULT_NOTE_SETTINGS).toEqual({ textFont: 'lato', codeFont: 'fira-code', fontSize: 16 });
    expect(parseNoteSettings(DEFAULT_NOTE_SETTINGS)).toEqual(DEFAULT_NOTE_SETTINGS);
  });

  it('take only the fonts and sizes offered', () => {
    expect(parseNoteSettings({ textFont: 'literata', codeFont: 'system', fontSize: 20 })).toEqual({
      textFont: 'literata',
      codeFont: 'system',
      fontSize: 20,
    });
    expect(parseNoteSettings({ textFont: 'comic-sans', codeFont: 'fira-code', fontSize: 16 })).toBeNull();
    expect(parseNoteSettings({ textFont: 'lato', codeFont: 'lato', fontSize: 16 })).toBeNull();
    expect(parseNoteSettings({ textFont: 'lato', codeFont: 'fira-code', fontSize: 19 })).toBeNull();
    expect(parseNoteSettings({ textFont: 'lato', codeFont: 'fira-code', fontSize: '16' })).toBeNull();
    expect(parseNoteSettings({ textFont: 'lato', codeFont: 'fira-code' })).toBeNull();
    expect(parseNoteSettings(null)).toBeNull();
    expect(parseNoteSettings('lato')).toBeNull();
  });

  it('fall back to the defaults when none are stored, or one is no longer offered', () => {
    expect(storedNoteSettings(null)).toEqual(DEFAULT_NOTE_SETTINGS);
    expect(storedNoteSettings({ text_font: 'inter', code_font: 'gone', font_size: 13 })).toEqual({
      textFont: 'inter',
      codeFont: 'fira-code',
      fontSize: 16,
    });
  });

  it('give each font an id of its own and a fallback the browser has', () => {
    for (const fonts of [TEXT_FONTS, CODE_FONTS]) {
      expect(new Set(fonts.map(font => font.id)).size).toBe(fonts.length);
      for (const font of fonts) expect(font.family).toMatch(/(sans-serif|serif|monospace)$/);
    }
    expect([...FONT_SIZES]).toEqual([...FONT_SIZES].sort((a, b) => a - b));
  });

  it('become CSS variables, with the size left to printing', () => {
    const settings = { textFont: 'inter', codeFont: 'jetbrains-mono', fontSize: 18 } as const;
    expect(fontFamilies(settings)).toEqual({
      '--notes-text-font': expect.stringMatching(/^"Inter Variable", /),
      '--notes-code-font': expect.stringMatching(/^"JetBrains Mono Variable", /),
    });
    expect(fontVariables(settings)).toMatchObject({ '--notes-text-size': '18px' });
  });

  it('keep lines a whole number of pixels tall', () => {
    expect(lineHeightFor(16)).toBe(26);
    for (const size of FONT_SIZES) expect(Number.isInteger(lineHeightFor(size))).toBe(true);
  });
});
