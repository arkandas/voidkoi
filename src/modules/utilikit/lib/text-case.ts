export const CASES = ['upper', 'lower', 'title', 'sentence', 'camel', 'pascal', 'snake', 'constant', 'kebab', 'dot', 'slug'] as const;
export type TextCase = (typeof CASES)[number];

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  lines: number;
  paragraphs: number;
  readingSeconds: number;
}

const WORDS = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{L}+|\p{N}+/gu;
const APOSTROPHES = /(?<=\p{L})['’](?=\p{L})/gu;
const WORD_START = /(^|[^\p{L}\p{N}'’])(\p{L})/gu;
const SENTENCE_START = /(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu;
const TRANSLITERATIONS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
};
const READING_WORDS_PER_MINUTE = 238;

export function splitWords(text: string): string[] {
  return text.replace(APOSTROPHES, '').match(WORDS) ?? [];
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ßæœøđðłþ]/g, letter => TRANSLITERATIONS[letter])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(APOSTROPHES, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function convertCase(text: string, to: TextCase): string {
  const words = () => splitWords(text);

  switch (to) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.toLowerCase().replace(WORD_START, (_, before: string, letter: string) => before + letter.toUpperCase());
    case 'sentence':
      return text.toLowerCase().replace(SENTENCE_START, (_, before: string, letter: string) => before + letter.toUpperCase());
    case 'camel':
      return words()
        .map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word)))
        .join('');
    case 'pascal':
      return words().map(capitalize).join('');
    case 'snake':
      return words().map(word => word.toLowerCase()).join('_');
    case 'constant':
      return words().map(word => word.toUpperCase()).join('_');
    case 'kebab':
      return words().map(word => word.toLowerCase()).join('-');
    case 'dot':
      return words().map(word => word.toLowerCase()).join('.');
    case 'slug':
      return slugify(text);
  }
}

function count<T>(items: Iterable<T>, keep: (item: T) => boolean): number {
  let total = 0;
  for (const item of items) if (keep(item)) total++;
  return total;
}

export function textStats(text: string, locale?: string): TextStats {
  const graphemes = [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)];
  const words = count(new Intl.Segmenter(locale, { granularity: 'word' }).segment(text), part => Boolean(part.isWordLike));
  const sentences = count(new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text), part => /[\p{L}\p{N}]/u.test(part.segment));

  return {
    characters: graphemes.length,
    charactersNoSpaces: count(graphemes, part => !/^\s+$/u.test(part.segment)),
    words,
    sentences,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
    paragraphs: text.split(/(?:\r?\n\s*){2,}/).filter(paragraph => paragraph.trim()).length,
    readingSeconds: Math.ceil((words / READING_WORDS_PER_MINUTE) * 60),
  };
}
