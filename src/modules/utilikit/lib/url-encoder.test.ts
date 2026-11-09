import { describe, expect, it } from 'vitest';
import { decodeURL, encodeURL, ENCODING_MODES, parseURL } from '@/modules/utilikit/lib/url-encoder';

const RESERVED = ":/?#[]@!$&'()*+,;=";

describe('encodeURL', () => {
  it('escapes every reserved character in component mode', () => {
    expect(encodeURL(RESERVED, 'component')).toEqual({ ok: true, value: "%3A%2F%3F%23%5B%5D%40!%24%26'()*%2B%2C%3B%3D" });
  });

  it('keeps the URL structure in uri mode', () => {
    expect(encodeURL(RESERVED, 'uri')).toEqual({ ok: true, value: ":/?#%5B%5D@!$&'()*+,;=" });
    expect(encodeURL('https://example.com/a b/ñ?q=x y&r=1#top', 'uri')).toEqual({
      ok: true,
      value: 'https://example.com/a%20b/%C3%B1?q=x%20y&r=1#top',
    });
  });

  it('leaves unreserved characters untouched in both modes', () => {
    for (const mode of ENCODING_MODES) {
      expect(encodeURL("AZaz09-_.~!*'()", mode)).toEqual({ ok: true, value: "AZaz09-_.~!*'()" });
    }
  });

  it('encodes spaces as %20 and escapes plus signs only in component mode', () => {
    expect(encodeURL('a b+c', 'component')).toEqual({ ok: true, value: 'a%20b%2Bc' });
    expect(encodeURL('a b+c', 'uri')).toEqual({ ok: true, value: 'a%20b+c' });
  });

  it('percent-encodes the UTF-8 bytes of non-ASCII characters', () => {
    expect(encodeURL('canción', 'component')).toEqual({ ok: true, value: 'canci%C3%B3n' });
    expect(encodeURL('日本', 'component')).toEqual({ ok: true, value: '%E6%97%A5%E6%9C%AC' });
    expect(encodeURL('🔧', 'uri')).toEqual({ ok: true, value: '%F0%9F%94%A7' });
  });

  it('reports an unpaired surrogate instead of throwing', () => {
    for (const mode of ENCODING_MODES) {
      expect(encodeURL('bad \uD800 text', mode)).toEqual({ ok: false, error: 'invalidCharacter' });
    }
  });
});

describe('decodeURL', () => {
  it('decodes percent-encoded UTF-8 in upper or lower case', () => {
    expect(decodeURL('canci%C3%B3n', 'component')).toEqual({ ok: true, value: 'canción' });
    expect(decodeURL('canci%c3%b3n', 'component')).toEqual({ ok: true, value: 'canción' });
    expect(decodeURL('%F0%9F%94%A7%20tools', 'uri')).toEqual({ ok: true, value: '🔧 tools' });
  });

  it('keeps plus signs literal', () => {
    for (const mode of ENCODING_MODES) {
      expect(decodeURL('a+b%20c', mode)).toEqual({ ok: true, value: 'a+b c' });
    }
  });

  it('keeps escaped reserved characters in uri mode only', () => {
    const encoded = '%2F%3F%23%26%3D%2B%24%2C%3A%40%3B%20%C3%B1';
    expect(decodeURL(encoded, 'component')).toEqual({ ok: true, value: '/?#&=+$,:@; ñ' });
    expect(decodeURL(encoded, 'uri')).toEqual({ ok: true, value: '%2F%3F%23%26%3D%2B%24%2C%3A%40%3B ñ' });
  });

  it('round-trips text through encodeURL in both modes', () => {
    const samples = ['https://example.com/a b?q=ñ&x=1#top', 'canción 🔧', "!*'()~", '100% sure', 'a+b=c&d', RESERVED];
    for (const mode of ENCODING_MODES) {
      for (const text of samples) {
        const encoded = encodeURL(text, mode);
        expect(encoded.ok).toBe(true);
        if (encoded.ok) expect(decodeURL(encoded.value, mode)).toEqual({ ok: true, value: text });
      }
    }
  });

  it('reports malformed percent sequences instead of throwing', () => {
    for (const mode of ENCODING_MODES) {
      for (const text of ['%E0%A4%A', '%', '100%', '%zz', '%C3', '%C3%28', '%ED%A0%80']) {
        expect(decodeURL(text, mode)).toEqual({ ok: false, error: 'malformedSequence' });
      }
    }
  });
});

describe('parseURL', () => {
  it('splits a full URL into base, parameters and fragment', () => {
    expect(parseURL('https://example.com/search?q=hello%20world&lang=es#results')).toEqual({
      base: 'https://example.com/search',
      fragment: 'results',
      params: [
        { key: 'q', value: 'hello%20world', decodedKey: 'q', decodedValue: 'hello world' },
        { key: 'lang', value: 'es', decodedKey: 'lang', decodedValue: 'es' },
      ],
    });
  });

  it('decodes + as a space in keys and values, but %2B as a plus sign', () => {
    const { params } = parseURL('?city=New+York&sum=1%2B1&full+name=Ada');
    expect(params.map(param => [param.decodedKey, param.decodedValue])).toEqual([
      ['city', 'New York'],
      ['sum', '1+1'],
      ['full name', 'Ada'],
    ]);
    expect(params[0].value).toBe('New+York');
  });

  it('keeps repeated keys in their original order', () => {
    const { params } = parseURL('https://example.com/?tag=a&tag=b&other=1&tag=a');
    expect(params.map(param => `${param.decodedKey}=${param.decodedValue}`)).toEqual(['tag=a', 'tag=b', 'other=1', 'tag=a']);
  });

  it('handles empty values, keys without = and empty pairs', () => {
    expect(parseURL('?empty=&flag&=orphan&&last=').params).toEqual([
      { key: 'empty', value: '', decodedKey: 'empty', decodedValue: '' },
      { key: 'flag', value: '', decodedKey: 'flag', decodedValue: '' },
      { key: '', value: 'orphan', decodedKey: '', decodedValue: 'orphan' },
      { key: 'last', value: '', decodedKey: 'last', decodedValue: '' },
    ]);
  });

  it('keeps = and ? that appear inside a value', () => {
    const { params } = parseURL('https://example.com/login?redirect=/home?tab=2&expr=a==b');
    expect(params.map(param => [param.decodedKey, param.decodedValue])).toEqual([
      ['redirect', '/home?tab=2'],
      ['expr', 'a==b'],
    ]);
  });

  it('separates the fragment, even when it contains ? or =', () => {
    expect(parseURL('https://example.com/app?id=7#/route?tab=1')).toEqual({
      base: 'https://example.com/app',
      fragment: '/route?tab=1',
      params: [{ key: 'id', value: '7', decodedKey: 'id', decodedValue: '7' }],
    });
    expect(parseURL('https://example.com/app#/route?tab=1')).toEqual({
      base: 'https://example.com/app',
      fragment: '/route?tab=1',
      params: [],
    });
  });

  it('accepts a bare query string', () => {
    const parsed = parseURL('name=John&age=30');
    expect(parsed.base).toBe('');
    expect(parsed.params.map(param => [param.decodedKey, param.decodedValue])).toEqual([
      ['name', 'John'],
      ['age', '30'],
    ]);
  });

  it('does not invent parameters for a URL without a query string', () => {
    for (const url of ['https://example.com/page', 'https://example.com/page=1', '/docs/a=b', 'example.com/docs']) {
      expect(parseURL(url)).toEqual({ base: url, params: [], fragment: '' });
    }
    expect(parseURL('https://example.com/?')).toEqual({ base: 'https://example.com/', params: [], fragment: '' });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseURL('  https://example.com/?a=1 \n')).toEqual({
      base: 'https://example.com/',
      fragment: '',
      params: [{ key: 'a', value: '1', decodedKey: 'a', decodedValue: '1' }],
    });
  });

  it('decodes malformed sequences leniently instead of failing', () => {
    const { params } = parseURL('?bad=%E0%A4%A&pct=100%&hex=%zz&cut=%C3');
    expect(params.map(param => param.value)).toEqual(['%E0%A4%A', '100%', '%zz', '%C3']);
    expect(params.map(param => param.decodedValue)).toEqual(['�%A', '100%', '%zz', '�']);
  });

  it('decodes every pair exactly like URLSearchParams', () => {
    const queries = [
      'q=hello%20world&lang=es',
      'city=New+York&sum=1%2B1&full+name=Ada',
      'tag=a&tag=b&other=1&tag=a',
      'empty=&flag&=orphan&&last=',
      'redirect=/home?tab=2&expr=a==b',
      'name=Jos%C3%A9&city=%E6%9D%B1%E4%BA%AC&emoji=%F0%9F%94%A7&raw=ñ',
      'bad=%E0%A4%A&pct=100%&hex=%zz&cut=%C3&mix=%C3%28',
      'phrase=caf%C3%A9+%26+bar&bom=%EF%BB%BFx&lower=%c3%a9',
    ];
    for (const query of queries) {
      const pairs = parseURL(`?${query}`).params.map(param => [param.decodedKey, param.decodedValue]);
      expect(pairs).toEqual([...new URLSearchParams(query)]);
    }
  });
});
