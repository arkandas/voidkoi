import { describe, expect, it } from 'vitest';
import { contentDisposition } from './http';

describe('contentDisposition', () => {
  it('marks inline files as inline', () => {
    expect(contentDisposition('inline', 'photo.jpg')).toBe(`inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`);
  });

  it('writes a plain ASCII filename in both forms', () => {
    expect(contentDisposition('attachment', 'video.mp4')).toBe(`attachment; filename="video.mp4"; filename*=UTF-8''video.mp4`);
  });

  it('encodes non-ASCII names with RFC 5987 and keeps an ASCII fallback', () => {
    const header = contentDisposition('attachment', 'canción ñ.mp3');
    expect(header).toContain('filename="canci_n _.mp3"');
    expect(header).toContain(`filename*=UTF-8''canci%C3%B3n%20%C3%B1.mp3`);
    expect(decodeURIComponent(header.split(`UTF-8''`)[1])).toBe('canción ñ.mp3');
  });

  it('strips characters that could break out of the header', () => {
    const header = contentDisposition('attachment', 'a"b\\c/d\r\nSet-Cookie: x=1.txt');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain('filename="abcdSet-Cookie: x=1.txt"');
  });

  it('percent-encodes the characters encodeURIComponent leaves alone', () => {
    expect(contentDisposition('attachment', "it's (1)*.txt")).toContain(`filename*=UTF-8''it%27s%20%281%29%2A.txt`);
  });

  it('never produces an empty filename', () => {
    expect(contentDisposition('attachment', '\r\n"/')).toContain('filename="download"');
  });
});
