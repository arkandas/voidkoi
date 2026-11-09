import { decodeFromBase64 } from '@/modules/utilikit/lib/base64-utils';

export const TIME_CLAIMS = ['iat', 'nbf', 'exp'] as const;
export type TimeClaim = (typeof TIME_CLAIMS)[number];
export type TokenTimes = Partial<Record<TimeClaim, number>>;
export type TokenStatus = 'valid' | 'expired' | 'notYetValid' | 'noExpiry';

type Segment = 'header' | 'payload';
export type JWTError = 'segments' | `${Segment}Encoding` | `${Segment}Json`;
export type JSONObject = Record<string, unknown>;

export interface DecodedJWT {
  header: JSONObject;
  payload: JSONObject;
  signature: string;
  times: TokenTimes;
  status: TokenStatus;
}

export type JWTResult = { ok: true; token: DecodedJWT } | { ok: false; error: JWTError };

type SegmentResult = { ok: true; value: JSONObject } | { ok: false; error: JWTError };

const MAX_DATE_SECONDS = 8.64e12;

function parseObject(text: string): JSONObject | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JSONObject) : null;
  } catch {
    return null;
  }
}

function decodeSegment(segment: string, name: Segment): SegmentResult {
  const decoded = decodeFromBase64(segment);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error === 'invalidBase64' ? `${name}Encoding` : `${name}Json` };
  }

  const value = parseObject(decoded.text);
  return value ? { ok: true, value } : { ok: false, error: `${name}Json` };
}

function readTimes(payload: JSONObject): TokenTimes {
  const times: TokenTimes = {};
  for (const claim of TIME_CLAIMS) {
    const value = payload[claim];
    if (typeof value === 'number' && Math.abs(value) <= MAX_DATE_SECONDS) times[claim] = value;
  }
  return times;
}

function getStatus({ exp, nbf }: TokenTimes, now: number): TokenStatus {
  if (exp !== undefined && now >= exp * 1000) return 'expired';
  if (nbf !== undefined && now < nbf * 1000) return 'notYetValid';
  return exp === undefined ? 'noExpiry' : 'valid';
}

export function decodeJWT(input: string, now: number): JWTResult {
  const segments = input.replace(/\s+/g, '').split('.');
  if (segments.length !== 3) return { ok: false, error: 'segments' };

  const [headerSegment, payloadSegment, signature] = segments;

  const header = decodeSegment(headerSegment, 'header');
  if (!header.ok) return header;

  const payload = decodeSegment(payloadSegment, 'payload');
  if (!payload.ok) return payload;

  const times = readTimes(payload.value);

  return {
    ok: true,
    token: {
      header: header.value,
      payload: payload.value,
      signature,
      times,
      status: getStatus(times, now),
    },
  };
}
