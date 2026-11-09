import { describe, expect, it } from 'vitest';
import { downloadFilename } from '@/modules/utilikit/lib/download-filename';
import { contentDisposition } from '@/lib/http';

const FALLBACK = 'video.mp4';

describe('downloadFilename', () => {
  describe('RFC 6266 examples', () => {
    it('reads an unquoted token', () => {
      expect(downloadFilename('Attachment; filename=example.html', FALLBACK)).toBe('example.html');
    });

    it('reads a quoted string with case-insensitive names and whitespace around "="', () => {
      expect(downloadFilename('INLINE; FILENAME= "an example.html"', FALLBACK)).toBe('an example.html');
    });

    it('decodes an extended filename*', () => {
      expect(downloadFilename("attachment; filename*= UTF-8''%e2%82%ac%20rates", FALLBACK)).toBe('€ rates');
    });

    it('prefers filename* over filename', () => {
      const header = "attachment; filename=\"EURO rates\"; filename*=utf-8''%e2%82%ac%20rates";
      expect(downloadFilename(header, FALLBACK)).toBe('€ rates');
    });
  });

  describe('RFC 5987 extended values', () => {
    it('decodes multi-byte UTF-8', () => {
      const header = "attachment; filename*=UTF-8''%c2%a3%20and%20%e2%82%ac%20rates";
      expect(downloadFilename(header, FALLBACK)).toBe('£ and € rates');
    });

    it('decodes ISO-8859-1 and ignores the language tag', () => {
      expect(downloadFilename("attachment; filename*=iso-8859-1'en'%A3%20rates", FALLBACK)).toBe('£ rates');
    });

    it('decodes percent-encoded UTF-8 file names', () => {
      expect(downloadFilename("attachment; filename*=UTF-8''canci%C3%B3n.mp3", FALLBACK)).toBe('canción.mp3');
      expect(downloadFilename("attachment; filename*=UTF-8'es'canci%C3%B3n.mp3", FALLBACK)).toBe('canción.mp3');
    });

    it('still prefers filename* when it comes first', () => {
      const header = "attachment; filename*=UTF-8''canci%C3%B3n.mp3; filename=\"cancion.mp3\"";
      expect(downloadFilename(header, FALLBACK)).toBe('canción.mp3');
    });

    it('keeps "+" as a literal plus sign', () => {
      expect(downloadFilename("attachment; filename*=UTF-8''a+b.mp3", FALLBACK)).toBe('a+b.mp3');
    });

    it('tolerates an extended value wrapped in quotes', () => {
      expect(downloadFilename("attachment; filename*=\"UTF-8''canci%C3%B3n.mp3\"", FALLBACK)).toBe('canción.mp3');
    });

    it('falls back to filename when filename* cannot be decoded', () => {
      const broken = [
        "UTF-8''%E2%82",
        "UTF-8''%FF.mp3",
        "UTF-8''%ZZ.mp3",
        "UTF-8''50%.mp3",
        "iso-8859-1''50%.mp3",
        "KOI8-R''%F0.mp3",
        'canci%C3%B3n.mp3',
      ];

      for (const value of broken) {
        expect(downloadFilename(`attachment; filename="plain.mp3"; filename*=${value}`, FALLBACK)).toBe('plain.mp3');
        expect(downloadFilename(`attachment; filename*=${value}`, FALLBACK)).toBe(FALLBACK);
      }
    });
  });

  describe('plain filename', () => {
    it('keeps separators that appear inside quotes', () => {
      expect(downloadFilename('attachment; filename="a; b=c.mp4"', FALLBACK)).toBe('a; b=c.mp4');
    });

    it('unescapes quoted pairs', () => {
      expect(downloadFilename('attachment; filename="say \\"hi\\" \\\\ bye.mp4"', FALLBACK)).toBe('say "hi" _ bye.mp4');
    });

    it('does not percent-decode it', () => {
      expect(downloadFilename('attachment; filename="100%25.mp4"', FALLBACK)).toBe('100%25.mp4');
    });

    it('ignores look-alike parameters and quoted values that contain filename=', () => {
      const header = 'attachment; x-filename="evil.exe"; title="filename=evil.exe"; filename="good.mp4"';
      expect(downloadFilename(header, FALLBACK)).toBe('good.mp4');
    });

    it('accepts a header without a disposition type', () => {
      expect(downloadFilename('filename="clip.mp4"', FALLBACK)).toBe('clip.mp4');
    });
  });

  describe('fallback', () => {
    it('is used when the header is missing', () => {
      expect(downloadFilename(null, FALLBACK)).toBe(FALLBACK);
      expect(downloadFilename(undefined, FALLBACK)).toBe(FALLBACK);
      expect(downloadFilename('', FALLBACK)).toBe(FALLBACK);
    });

    it('is used when the header names no file', () => {
      for (const header of ['attachment', 'inline; size=1024', 'attachment; filename=""', 'attachment; filename=   ;']) {
        expect(downloadFilename(header, FALLBACK)).toBe(FALLBACK);
      }
    });
  });

  describe('sanitising', () => {
    it('never returns path separators', () => {
      expect(downloadFilename('attachment; filename="../../etc/passwd"', FALLBACK)).toBe('.._.._etc_passwd');
      expect(downloadFilename("attachment; filename*=UTF-8''..%2F..%5Cevil.sh", FALLBACK)).toBe('.._.._evil.sh');
    });

    it('strips control characters and surrounding whitespace', () => {
      expect(downloadFilename("attachment; filename*=UTF-8''%20%20a%0Ab%00.mp4%09", FALLBACK)).toBe('ab.mp4');
    });

    it('rejects names made only of dots', () => {
      expect(downloadFilename('attachment; filename=".."', FALLBACK)).toBe(FALLBACK);
      expect(downloadFilename("attachment; filename=\"clip.mp4\"; filename*=UTF-8''.", FALLBACK)).toBe('clip.mp4');
    });
  });

  describe('round trip with the server encoder', () => {
    it.each([
      'canción.mp3',
      'Rick Astley - Never Gonna Give You Up (Official Video).mp4',
      '日本語のタイトル.m4a',
      "It's 100% fine! *really*.opus",
      '🔥 fire & ice.wav',
      'a;b=c.mp4',
    ])('recovers %s', name => {
      expect(downloadFilename(contentDisposition('attachment', name), FALLBACK)).toBe(name);
    });

    it('returns the name the server cleaned', () => {
      expect(downloadFilename(contentDisposition('attachment', 'AC/DC "Live".mp4'), FALLBACK)).toBe('ACDC Live.mp4');
    });
  });
});
