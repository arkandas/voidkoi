export const REGEX_FLAGS = ['g', 'i', 'm', 's', 'u', 'y'] as const;
export type RegexFlag = (typeof REGEX_FLAGS)[number];

export const MAX_MATCHES = 1000;

export interface RegexGroup {
  index: number;
  name?: string;
  value?: string;
  start?: number;
  end?: number;
}

export interface RegexMatch {
  start: number;
  end: number;
  value: string;
  groups: RegexGroup[];
}

export type RegexResult =
  | { ok: true; matches: RegexMatch[]; truncated: boolean; replaced?: string }
  | { ok: false; error: string };

export function captureGroupNames(pattern: string): Array<string | undefined> {
  const names: Array<string | undefined> = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      i++;
    } else if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
    } else if (char === '(') {
      if (pattern[i + 1] !== '?') {
        names.push(undefined);
      } else {
        const named = /^\?<([^>=!][^>]*)>/.exec(pattern.slice(i + 1));
        if (named) names.push(named[1]);
      }
    }
  }

  return names;
}

function withFlags(flags: string, extra: string): string {
  return [...new Set(flags + extra)].join('');
}

function toMatch(match: RegExpExecArray, names: Array<string | undefined>): RegexMatch {
  const indices = match.indices;
  return {
    start: match.index,
    end: match.index + match[0].length,
    value: match[0],
    groups: match.slice(1).map((value, position) => ({
      index: position + 1,
      name: names[position],
      value,
      start: indices?.[position + 1]?.[0],
      end: indices?.[position + 1]?.[1],
    })),
  };
}

export function testRegex(pattern: string, flags: string, text: string, replacement?: string): RegexResult {
  let regex: RegExp;
  try {
    new RegExp(pattern, flags);
    regex = new RegExp(pattern, withFlags(flags, 'd'));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const names = captureGroupNames(pattern);
  const matches: RegexMatch[] = [];
  let truncated = false;

  if (regex.global) {
    for (const match of text.matchAll(regex)) {
      if (matches.length === MAX_MATCHES) {
        truncated = true;
        break;
      }
      matches.push(toMatch(match, names));
    }
  } else {
    const match = regex.exec(text);
    if (match) matches.push(toMatch(match, names));
  }

  const replaced = replacement === undefined ? undefined : text.replace(new RegExp(pattern, flags), replacement);
  return { ok: true, matches, truncated, replaced };
}

export interface HighlightPart {
  text: string;
  match?: number;
}

export function highlightParts(text: string, matches: RegexMatch[]): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let position = 0;

  matches.forEach((match, index) => {
    if (match.start < position) return;
    if (match.start > position) parts.push({ text: text.slice(position, match.start) });
    parts.push({ text: match.value, match: index });
    position = match.end;
  });

  if (position < text.length) parts.push({ text: text.slice(position) });
  return parts;
}
