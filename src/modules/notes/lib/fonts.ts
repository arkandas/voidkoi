import type { CSSProperties } from 'react';

/*
 * The fonts and text sizes notes are drawn in, picked in Settings. The text
 * font is for writing and reading, the code font for code. The faces come
 * from `font-faces.ts`, and a browser downloads one only when a note uses it.
 */

const SANS = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SERIF = 'ui-serif, Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export interface Font {
  id: string;
  /** Null for the system's own font, whose name is translated. */
  name: string | null;
  /** The CSS font-family. */
  family: string;
}

export const TEXT_FONTS = [
  { id: 'lato', name: 'Lato', family: `Lato, ${SANS}` },
  { id: 'inter', name: 'Inter', family: `"Inter Variable", ${SANS}` },
  { id: 'ibm-plex-sans', name: 'IBM Plex Sans', family: `"IBM Plex Sans Variable", ${SANS}` },
  { id: 'atkinson-hyperlegible', name: 'Atkinson Hyperlegible', family: `"Atkinson Hyperlegible Next Variable", ${SANS}` },
  { id: 'source-serif', name: 'Source Serif', family: `"Source Serif 4 Variable", ${SERIF}` },
  { id: 'literata', name: 'Literata', family: `"Literata Variable", ${SERIF}` },
  { id: 'system', name: null, family: SANS },
] as const satisfies readonly Font[];

export const CODE_FONTS = [
  { id: 'fira-code', name: 'Fira Code', family: `"Fira Code Variable", ${MONO}` },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', family: `"JetBrains Mono Variable", ${MONO}` },
  { id: 'cascadia-code', name: 'Cascadia Code', family: `"Cascadia Code Variable", ${MONO}` },
  { id: 'source-code-pro', name: 'Source Code Pro', family: `"Source Code Pro Variable", ${MONO}` },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono', family: `"IBM Plex Mono", ${MONO}` },
  { id: 'system', name: null, family: MONO },
] as const satisfies readonly Font[];

export type TextFontId = (typeof TEXT_FONTS)[number]['id'];
export type CodeFontId = (typeof CODE_FONTS)[number]['id'];

/** The text sizes, in CSS pixels. */
export const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24] as const;

/** How an account's notes are drawn. */
export interface NoteSettings {
  textFont: TextFontId;
  codeFont: CodeFontId;
  fontSize: number;
}

export const DEFAULT_NOTE_SETTINGS: NoteSettings = { textFont: 'lato', codeFont: 'fira-code', fontSize: 16 };

function isTextFont(value: unknown): value is TextFontId {
  return TEXT_FONTS.some(font => font.id === value);
}

function isCodeFont(value: unknown): value is CodeFontId {
  return CODE_FONTS.some(font => font.id === value);
}

function isFontSize(value: unknown): value is number {
  return FONT_SIZES.some(size => size === value);
}

/** Settings as sent: null unless each one is among the choices. */
export function parseNoteSettings(value: unknown): NoteSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const { textFont, codeFont, fontSize } = value as Record<string, unknown>;
  if (!isTextFont(textFont) || !isCodeFont(codeFont) || !isFontSize(fontSize)) return null;
  return { textFont, codeFont, fontSize };
}

/** Settings as stored. One no longer offered gives way to its default. */
export function storedNoteSettings(row: { text_font: string; code_font: string; font_size: number } | null): NoteSettings {
  return {
    textFont: isTextFont(row?.text_font) ? row.text_font : DEFAULT_NOTE_SETTINGS.textFont,
    codeFont: isCodeFont(row?.code_font) ? row.code_font : DEFAULT_NOTE_SETTINGS.codeFont,
    fontSize: isFontSize(row?.font_size) ? row.font_size : DEFAULT_NOTE_SETTINGS.fontSize,
  };
}

/** The line height for a text size, in whole pixels so the line numbers stay level with the lines. */
export function lineHeightFor(size: number): number {
  return Math.round(size * 1.625);
}

/** The two fonts as the CSS variables notes.css reads. Printing takes only these and keeps its own size. */
export function fontFamilies(settings: NoteSettings): CSSProperties {
  const text = TEXT_FONTS.find(font => font.id === settings.textFont) ?? TEXT_FONTS[0];
  const code = CODE_FONTS.find(font => font.id === settings.codeFont) ?? CODE_FONTS[0];
  return { '--notes-text-font': text.family, '--notes-code-font': code.family } as CSSProperties;
}

/** The fonts and the text size, for the editor, the note on the left and the preview. */
export function fontVariables(settings: NoteSettings): CSSProperties {
  return { ...fontFamilies(settings), '--notes-text-size': `${settings.fontSize}px` } as CSSProperties;
}
