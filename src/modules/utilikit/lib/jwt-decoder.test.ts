import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { decodeJWT, type DecodedJWT } from '@/modules/utilikit/lib/jwt-decoder';

const JWT_IO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const NOW_SECONDS = NOW / 1000;

const encodeSegment = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

const HEADER = encodeSegment({ alg: 'HS256', typ: 'JWT' });
const makeToken = (payload: unknown) => `${HEADER}.${encodeSegment(payload)}.c2lnbmF0dXJl`;

function decode(token: string, now = NOW): DecodedJWT {
  const result = decodeJWT(token, now);
  if (!result.ok) throw new Error(`expected the token to decode, got "${result.error}"`);
  return result.token;
}

describe('decodeJWT', () => {
  it('decodes the jwt.io example token', () => {
    const token = decode(JWT_IO_TOKEN);
    expect(token.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(token.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
    expect(token.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(token.times).toEqual({ iat: 1516239022 });
    expect(new Date(1516239022 * 1000).toISOString()).toBe('2018-01-18T01:30:22.000Z');
    expect(token.status).toBe('noExpiry');
  });

  it('decodes unpadded base64url segments that use - and _', () => {
    const payload = { q: '???>>>' };
    const segment = encodeSegment(payload);
    expect(segment).toMatch(/[-_]/);
    expect(segment).not.toContain('=');
    expect(segment.length % 4).not.toBe(0);
    expect(decode(`${HEADER}.${segment}.sig`).payload).toEqual(payload);
  });

  it('decodes non-ASCII UTF-8 payloads', () => {
    const payload = { name: 'José Núñez', city: '東京', emoji: '🔐', greeting: 'Привет' };
    expect(decode(makeToken(payload)).payload).toEqual(payload);
  });

  it('ignores whitespace and line breaks around and inside the token', () => {
    const wrapped = `  ${JWT_IO_TOKEN.slice(0, 30)}\n${JWT_IO_TOKEN.slice(30, 90)}\r\n${JWT_IO_TOKEN.slice(90)}\n`;
    expect(decode(wrapped)).toEqual(decode(JWT_IO_TOKEN));
  });

  it('accepts an unsecured token with an empty signature', () => {
    const token = decode(`${encodeSegment({ alg: 'none' })}.${encodeSegment({ sub: 'guest' })}.`);
    expect(token.header).toEqual({ alg: 'none' });
    expect(token.payload).toEqual({ sub: 'guest' });
    expect(token.signature).toBe('');
  });

  it('rejects tokens that do not have exactly three segments', () => {
    for (const input of ['', 'abc', 'a.b', 'a.b.c.d', `${JWT_IO_TOKEN}.extra`, 'five.part.encrypted.jwe.token']) {
      expect(decodeJWT(input, NOW)).toEqual({ ok: false, error: 'segments' });
    }
  });

  it('reports a header or payload that is not valid base64url', () => {
    const [header, payload, signature] = JWT_IO_TOKEN.split('.');
    expect(decodeJWT(`e!J.${payload}.${signature}`, NOW)).toEqual({ ok: false, error: 'headerEncoding' });
    expect(decodeJWT(`${header}.${payload}*.${signature}`, NOW)).toEqual({ ok: false, error: 'payloadEncoding' });
    expect(decodeJWT(`${header}.AAAAA.${signature}`, NOW)).toEqual({ ok: false, error: 'payloadEncoding' });
  });

  it('reports a header or payload that is not a JSON object', () => {
    expect(decodeJWT(`${encodeSegment('not json')}.${encodeSegment({})}.sig`, NOW)).toEqual({
      ok: false,
      error: 'headerJson',
    });

    for (const payload of ['null', '[1,2]', '"text"', '42', '{"unterminated": ', '']) {
      expect(decodeJWT(`${HEADER}.${encodeSegment(payload)}.sig`, NOW)).toEqual({ ok: false, error: 'payloadJson' });
    }

    const binary = Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url');
    expect(decodeJWT(`${HEADER}.${binary}.sig`, NOW)).toEqual({ ok: false, error: 'payloadJson' });
  });

  it('collects the numeric time claims in seconds', () => {
    const token = decode(makeToken({ iat: 1516239022, nbf: 1516239022.5, exp: 1893456000 }));
    expect(token.times).toEqual({ iat: 1516239022, nbf: 1516239022.5, exp: 1893456000 });
    expect(new Date(1893456000 * 1000).toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });

  it('ignores time claims that are not usable dates', () => {
    const token = decode(makeToken({ exp: '1893456000', nbf: null, iat: 1e20 }));
    expect(token.times).toEqual({});
    expect(token.status).toBe('noExpiry');
  });
});

describe('token status', () => {
  it('is expired when exp is in the past', () => {
    expect(decode(makeToken({ exp: NOW_SECONDS - 60 })).status).toBe('expired');
  });

  it('is valid when exp is in the future', () => {
    expect(decode(makeToken({ exp: NOW_SECONDS + 3600 })).status).toBe('valid');
  });

  it('treats the exact expiration instant as expired (RFC 7519, section 4.1.4)', () => {
    const token = makeToken({ exp: NOW_SECONDS });
    expect(decode(token, NOW).status).toBe('expired');
    expect(decode(token, NOW - 1).status).toBe('valid');
  });

  it('is not yet valid while nbf is in the future', () => {
    expect(decode(makeToken({ nbf: NOW_SECONDS + 60, exp: NOW_SECONDS + 3600 })).status).toBe('notYetValid');
    expect(decode(makeToken({ nbf: NOW_SECONDS + 60 })).status).toBe('notYetValid');
    expect(decode(makeToken({ nbf: NOW_SECONDS, exp: NOW_SECONDS + 3600 })).status).toBe('valid');
  });

  it('has no expiry when there is no exp claim', () => {
    expect(decode(makeToken({ sub: 'user', nbf: NOW_SECONDS - 60 })).status).toBe('noExpiry');
  });

  it('depends only on the injected clock', () => {
    const token = makeToken({ nbf: Date.UTC(2030, 0, 1) / 1000, exp: Date.UTC(2031, 0, 1) / 1000 });
    expect(decode(token, Date.UTC(2029, 5, 1)).status).toBe('notYetValid');
    expect(decode(token, Date.UTC(2030, 5, 1)).status).toBe('valid');
    expect(decode(token, Date.UTC(2031, 5, 1)).status).toBe('expired');
  });
});
