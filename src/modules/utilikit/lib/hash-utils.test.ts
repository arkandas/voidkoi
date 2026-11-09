import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatHashes, hashBytes, hashText } from '@/modules/utilikit/lib/hash-utils';

describe('hashText', () => {
  it('matches the published vectors for "abc"', () => {
    expect(hashText('abc')).toEqual({
      md5: '900150983cd24fb0d6963f7d28e17f72',
      sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      sha384:
        'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
      sha512:
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    });
  });

  it('matches the published vectors for the empty string', () => {
    const hashes = hashText('');
    expect(hashes.md5).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hashes.sha1).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hashes.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('agrees with node:crypto for multi-byte UTF-8 text', () => {
    for (const text of ['ñ', 'canción', '日本語', '🔧 tools']) {
      const hashes = hashText(text);
      expect(hashes.md5).toBe(createHash('md5').update(text, 'utf8').digest('hex'));
      expect(hashes.sha1).toBe(createHash('sha1').update(text, 'utf8').digest('hex'));
      expect(hashes.sha256).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
      expect(hashes.sha384).toBe(createHash('sha384').update(text, 'utf8').digest('hex'));
      expect(hashes.sha512).toBe(createHash('sha512').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('hashBytes', () => {
  it('produces the same digests as the equivalent text', () => {
    const bytes = new TextEncoder().encode('hello world');
    expect(hashBytes(bytes.buffer as ArrayBuffer)).toEqual(hashText('hello world'));
  });

  it('agrees with node:crypto for binary data that is not valid UTF-8', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x01]);
    const hashes = hashBytes(bytes.buffer as ArrayBuffer);
    expect(hashes.md5).toBe(createHash('md5').update(bytes).digest('hex'));
    expect(hashes.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});

describe('formatHashes', () => {
  it('lists every algorithm with its label', () => {
    const lines = formatHashes(hashText('abc')).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('MD5: 900150983cd24fb0d6963f7d28e17f72');
    expect(lines[4]).toMatch(/^SHA-512: [0-9a-f]{128}$/);
  });
});
