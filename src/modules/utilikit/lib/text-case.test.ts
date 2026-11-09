import { describe, expect, it } from 'vitest';
import { CASES, convertCase, slugify, splitWords, textStats } from '@/modules/utilikit/lib/text-case';

describe('splitWords', () => {
  it('splits on separators, case changes and numbers', () => {
    expect(splitWords('hello_world-foo bar')).toEqual(['hello', 'world', 'foo', 'bar']);
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(splitWords('userID42')).toEqual(['user', 'ID', '42']);
    expect(splitWords('getHTTPResponseCode')).toEqual(['get', 'HTTP', 'Response', 'Code']);
  });

  it('keeps accented letters and drops apostrophes inside words', () => {
    expect(splitWords('Canción de José')).toEqual(['Canción', 'de', 'José']);
    expect(splitWords("don't stop")).toEqual(['dont', 'stop']);
  });
});

describe('convertCase', () => {
  const text = 'The quick brown fox. jumps over the lazy dog';

  it('changes the case of the whole text', () => {
    expect(convertCase(text, 'upper')).toBe('THE QUICK BROWN FOX. JUMPS OVER THE LAZY DOG');
    expect(convertCase('ÁRBOL Grande', 'lower')).toBe('árbol grande');
  });

  it('capitalizes every word for title case, keeping punctuation', () => {
    expect(convertCase(text, 'title')).toBe('The Quick Brown Fox. Jumps Over The Lazy Dog');
    expect(convertCase("it's HELLO-world", 'title')).toBe("It's Hello-World");
  });

  it('capitalizes the start of each sentence', () => {
    expect(convertCase('HELLO THERE. how are you? fine!\nnew line', 'sentence')).toBe('Hello there. How are you? Fine!\nNew line');
  });

  it('builds programming cases from words', () => {
    const source = 'Hello wonderful World 2';
    expect(convertCase(source, 'camel')).toBe('helloWonderfulWorld2');
    expect(convertCase(source, 'pascal')).toBe('HelloWonderfulWorld2');
    expect(convertCase(source, 'snake')).toBe('hello_wonderful_world_2');
    expect(convertCase(source, 'constant')).toBe('HELLO_WONDERFUL_WORLD_2');
    expect(convertCase(source, 'kebab')).toBe('hello-wonderful-world-2');
    expect(convertCase(source, 'dot')).toBe('hello.wonderful.world.2');
  });

  it('converts between programming cases', () => {
    expect(convertCase('parseXMLDocument', 'snake')).toBe('parse_xml_document');
    expect(convertCase('MAX_RETRY_COUNT', 'camel')).toBe('maxRetryCount');
  });

  it('returns empty results for empty text', () => {
    for (const to of CASES) expect(convertCase('', to)).toBe('');
  });
});

describe('slugify', () => {
  it('removes accents and punctuation', () => {
    expect(slugify('¡Hola, Señor Muñoz! ¿Qué tal?')).toBe('hola-senor-munoz-que-tal');
    expect(slugify('  Crème brûlée & Café  ')).toBe('creme-brulee-cafe');
  });

  it('transliterates letters that do not decompose', () => {
    expect(slugify('Straße Øresund Łódź')).toBe('strasse-oresund-lodz');
  });

  it('keeps letters from other scripts', () => {
    expect(slugify('Привет, мир')).toBe('привет-мир');
  });

  it('drops apostrophes instead of splitting on them', () => {
    expect(slugify("Don't panic")).toBe('dont-panic');
  });
});

describe('textStats', () => {
  it('counts characters, words, sentences, lines and paragraphs', () => {
    const stats = textStats('Hello world. This is a test!\n\nSecond paragraph here.', 'en');
    expect(stats.words).toBe(9);
    expect(stats.sentences).toBe(3);
    expect(stats.lines).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.characters).toBe(52);
    expect(stats.charactersNoSpaces).toBe(43);
  });

  it('counts emoji and combined characters as one character', () => {
    expect(textStats('👍🏽é', 'en').characters).toBe(2);
  });

  it('estimates reading time', () => {
    expect(textStats(Array(238).fill('word').join(' '), 'en').readingSeconds).toBe(60);
    expect(textStats('', 'en')).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      lines: 0,
      paragraphs: 0,
      readingSeconds: 0,
    });
  });
});
