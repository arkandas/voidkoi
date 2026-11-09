import { describe, expect, it } from 'vitest';
import { DOWNLOAD_MIME_TYPES, sanitizeFilename } from '@/modules/utilikit/lib/media-types';

describe('sanitizeFilename', () => {
  it('removes characters that are invalid in filenames', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j', 'x')).toBe('abcdefghij');
  });

  it('collapses whitespace and control characters', () => {
    expect(sanitizeFilename('  hello \t\n  world\u0007 ', 'x')).toBe('hello world');
  });

  it('keeps unicode text', () => {
    expect(sanitizeFilename('Canción de cuna 🎵', 'x')).toBe('Canción de cuna 🎵');
  });

  it('caps the length at 80 characters', () => {
    expect(sanitizeFilename('a'.repeat(200), 'x')).toHaveLength(80);
  });

  it('uses the fallback when nothing is left', () => {
    expect(sanitizeFilename('///', 'video')).toBe('video');
    expect(sanitizeFilename('', 'video')).toBe('video');
  });
});

describe('DOWNLOAD_MIME_TYPES', () => {
  it('covers every format the downloaders produce', () => {
    for (const extension of ['.mp4', '.webm', '.mp3', '.m4a', '.opus', '.ogg', '.wav']) {
      expect(DOWNLOAD_MIME_TYPES).toHaveProperty([extension]);
    }
  });
});
