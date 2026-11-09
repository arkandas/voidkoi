import jsQR from 'jsqr';

export type QrContent =
  | { kind: 'url'; url: string }
  | { kind: 'wifi'; ssid: string; password: string; security: string; hidden: boolean }
  | { kind: 'email'; address: string; subject: string; body: string }
  | { kind: 'phone'; number: string }
  | { kind: 'sms'; number: string; message: string }
  | { kind: 'geo'; latitude: number; longitude: number }
  | { kind: 'text'; text: string };

export const DECODE_SIZES = [1600, 1000, 600, 3000] as const;

export function decodeQr(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

function splitEscaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length) current += value[++i];
    else if (char === separator) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

function fields(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of splitEscaped(body, ';')) {
    const colon = part.indexOf(':');
    if (colon > 0) map.set(part.slice(0, colon).toUpperCase(), part.slice(colon + 1));
  }
  return map;
}

function rawFields(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '\\' && i + 1 < body.length) {
      current += char + body[i + 1];
      i++;
    } else if (char === ';') {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

const unescapeValue = (value: string) => value.replace(/\\(.)/g, '$1');

function parseWifi(body: string): QrContent {
  const values = new Map<string, string>();
  for (const part of rawFields(body)) {
    const colon = part.indexOf(':');
    if (colon > 0) values.set(part.slice(0, colon).toUpperCase(), unescapeValue(part.slice(colon + 1)));
  }
  return {
    kind: 'wifi',
    ssid: values.get('S') ?? '',
    password: values.get('P') ?? '',
    security: values.get('T') || 'nopass',
    hidden: values.get('H')?.toLowerCase() === 'true',
  };
}

function query(url: URL, name: string): string {
  for (const [key, value] of url.searchParams) if (key.toLowerCase() === name) return value;
  return '';
}

export function parseQrContent(text: string): QrContent {
  const trimmed = text.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1].toLowerCase();

  if (scheme === 'wifi') return parseWifi(trimmed.slice(5));

  if (scheme === 'matmsg') {
    const values = fields(trimmed.slice(7));
    return { kind: 'email', address: values.get('TO') ?? '', subject: values.get('SUB') ?? '', body: values.get('BODY') ?? '' };
  }

  if (scheme === 'smsto') {
    const [number = '', ...message] = trimmed.slice(6).split(':');
    return { kind: 'sms', number, message: message.join(':') };
  }

  if (scheme === 'geo') {
    const [latitude, longitude] = trimmed.slice(4).split(/[,;?]/).map(Number);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { kind: 'geo', latitude, longitude };
  }

  try {
    const url = new URL(trimmed);
    if (scheme === 'http' || scheme === 'https') return { kind: 'url', url: url.href };
    if (scheme === 'mailto') {
      return {
        kind: 'email',
        address: decodeURIComponent(url.pathname),
        subject: query(url, 'subject'),
        body: query(url, 'body'),
      };
    }
    if (scheme === 'tel') return { kind: 'phone', number: decodeURIComponent(url.pathname) };
    if (scheme === 'sms') return { kind: 'sms', number: decodeURIComponent(url.pathname), message: query(url, 'body') };
  } catch {}

  return { kind: 'text', text };
}
