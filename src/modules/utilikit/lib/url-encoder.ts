export const ENCODING_MODES = ['component', 'uri'] as const;
export type EncodingMode = (typeof ENCODING_MODES)[number];

export type URLCodingError = 'invalidCharacter' | 'malformedSequence';
export type URLCodingResult = { ok: true; value: string } | { ok: false; error: URLCodingError };

export interface URLParameter {
  key: string;
  value: string;
  decodedKey: string;
  decodedValue: string;
}

export interface ParsedURL {
  base: string;
  params: URLParameter[];
  fragment: string;
}

const ESCAPE_RUN = /(?:%[\da-f]{2})+/gi;
const SCHEME_OR_PATH = /^(?:[a-z][a-z\d+.-]*:|\/)/i;
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });

export function encodeURL(text: string, mode: EncodingMode): URLCodingResult {
  try {
    return { ok: true, value: mode === 'uri' ? encodeURI(text) : encodeURIComponent(text) };
  } catch {
    return { ok: false, error: 'invalidCharacter' };
  }
}

export function decodeURL(text: string, mode: EncodingMode): URLCodingResult {
  try {
    return { ok: true, value: mode === 'uri' ? decodeURI(text) : decodeURIComponent(text) };
  } catch {
    return { ok: false, error: 'malformedSequence' };
  }
}

function decodeFormComponent(raw: string): string {
  return raw
    .replace(/\+/g, ' ')
    .replace(ESCAPE_RUN, run => utf8.decode(new Uint8Array(run.slice(1).split('%').map(hex => parseInt(hex, 16)))));
}

function splitQuery(url: string): [base: string, query: string] {
  const queryStart = url.indexOf('?');
  if (queryStart !== -1) return [url.slice(0, queryStart), url.slice(queryStart + 1)];
  return url.includes('=') && !SCHEME_OR_PATH.test(url) ? ['', url] : [url, ''];
}

export function parseURL(input: string): ParsedURL {
  const text = input.trim();
  const hashStart = text.indexOf('#');
  const [base, query] = splitQuery(hashStart === -1 ? text : text.slice(0, hashStart));

  const params = query
    .split('&')
    .filter(Boolean)
    .map(pair => {
      const separator = pair.indexOf('=');
      const key = separator === -1 ? pair : pair.slice(0, separator);
      const value = separator === -1 ? '' : pair.slice(separator + 1);
      return { key, value, decodedKey: decodeFormComponent(key), decodedValue: decodeFormComponent(value) };
    });

  return { base, params, fragment: hashStart === -1 ? '' : text.slice(hashStart + 1) };
}
