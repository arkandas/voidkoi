import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, decodeFromBase64, encodeFileToBase64, encodeToBase64 } from '@/modules/utilikit/lib/base64-utils';

const RFC_4648_VECTORS = [
  ['', ''],
  ['f', 'Zg=='],
  ['fo', 'Zm8='],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg=='],
  ['fooba', 'Zm9vYmE='],
  ['foobar', 'Zm9vYmFy'],
] as const;

const UTF8_SAMPLES = ['canción', 'Ñandú', '日本語', 'Привет', '🔧 tools', '﻿with BOM', 'nul\u0000byte'];

const patternedBytes = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 7919 + 13) & 0xff);

describe('encodeToBase64', () => {
  it('matches the RFC 4648 test vectors', () => {
    for (const [text, base64] of RFC_4648_VECTORS) {
      expect(encodeToBase64(text)).toBe(base64);
    }
  });

  it('encodes text as UTF-8', () => {
    expect(encodeToBase64('canción')).toBe('Y2FuY2nDs24=');
    expect(encodeToBase64('🔧')).toBe('8J+Upw==');
    for (const text of UTF8_SAMPLES) {
      expect(encodeToBase64(text)).toBe(Buffer.from(text, 'utf8').toString('base64'));
    }
  });

  it('replaces an unpaired surrogate with U+FFFD instead of failing', () => {
    expect(encodeToBase64('\uD800')).toBe('77+9');
  });
});

describe('decodeFromBase64', () => {
  it('decodes the RFC 4648 test vectors', () => {
    for (const [text, base64] of RFC_4648_VECTORS) {
      expect(decodeFromBase64(base64)).toEqual({ ok: true, text });
    }
  });

  it('round-trips UTF-8 text', () => {
    for (const text of UTF8_SAMPLES) {
      expect(decodeFromBase64(encodeToBase64(text))).toEqual({ ok: true, text });
    }
  });

  it('accepts input without padding', () => {
    expect(decodeFromBase64('Zg')).toEqual({ ok: true, text: 'f' });
    expect(decodeFromBase64('Zm8')).toEqual({ ok: true, text: 'fo' });
    expect(decodeFromBase64('Zm9vYmE')).toEqual({ ok: true, text: 'fooba' });
  });

  it('accepts the URL-safe alphabet', () => {
    const urlSafe = Buffer.from('???>>>').toString('base64url');
    expect(urlSafe).toBe('Pz8_Pj4-');
    expect(decodeFromBase64(urlSafe)).toEqual({ ok: true, text: '???>>>' });
    expect(decodeFromBase64('Pz8/Pj4+')).toEqual({ ok: true, text: '???>>>' });
  });

  it('ignores spaces, tabs and line breaks', () => {
    expect(decodeFromBase64('Zm9v\nYmFy')).toEqual({ ok: true, text: 'foobar' });
    expect(decodeFromBase64('  Zm9v YmFy\r\n\t')).toEqual({ ok: true, text: 'foobar' });

    const text = 'Línea de texto bastante larga. '.repeat(10);
    const wrapped = Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n');
    expect(wrapped).toContain('\r\n');
    expect(decodeFromBase64(wrapped)).toEqual({ ok: true, text });
  });

  it('rejects malformed Base64', () => {
    for (const input of ['Zm9v!', 'Z', 'Zm9vY', 'Zg=', '=Zg=', 'Zg==Zg==', 'Zm9vYg===', 'Zm9v€', '....']) {
      expect(decodeFromBase64(input)).toEqual({ ok: false, error: 'invalidBase64' });
    }
  });

  it('reports valid Base64 whose bytes are not UTF-8 text', () => {
    expect(decodeFromBase64('//79')).toEqual({ ok: false, error: 'notText' });
    expect(decodeFromBase64(Buffer.from([0xc3, 0x28]).toString('base64'))).toEqual({ ok: false, error: 'notText' });
  });
});

describe('bytesToBase64 and base64ToBytes', () => {
  it('agree with Buffer for every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const base64 = Buffer.from(bytes).toString('base64');
    expect(bytesToBase64(bytes)).toBe(base64);
    expect(base64ToBytes(base64)).toEqual(bytes);
  });

  it('agree with Buffer for large inputs of every length remainder', () => {
    for (const length of [1, 2, 3, 4, 24575, 24576, 24577, 65536, 100001]) {
      const bytes = patternedBytes(length);
      const base64 = Buffer.from(bytes).toString('base64');
      expect(bytesToBase64(bytes)).toBe(base64);
      expect(base64ToBytes(base64)).toEqual(bytes);
    }
  });

  it('returns null for input that is not Base64', () => {
    expect(base64ToBytes('not base64!')).toBeNull();
  });
});

describe('encodeFileToBase64', () => {
  it('encodes the raw bytes of a file', async () => {
    expect(await encodeFileToBase64(new Blob([Uint8Array.of(0, 1, 2, 253, 254, 255)]))).toBe('AAEC/f7/');
    expect(await encodeFileToBase64(new File(['canción'], 'song.txt'))).toBe('Y2FuY2nDs24=');
  });

  it('returns an empty string for an empty file', async () => {
    expect(await encodeFileToBase64(new File([], 'empty.bin'))).toBe('');
  });
});
