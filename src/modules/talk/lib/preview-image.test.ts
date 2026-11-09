import { describe, expect, it } from 'vitest';

import { canPreview, PREVIEW_SOURCE_MAX_BYTES } from './preview-image';

const file = (type: string, size: number): File =>
  ({ type, size, name: 'x' }) as unknown as File;

describe('canPreview', () => {
  it('makes a preview of an ordinary photo', () => {
    expect(canPreview(file('image/jpeg', 8 * 1024 * 1024))).toBe(true);
  });

  it('leaves a picture too big to decode safely as a plain file', () => {
    expect(canPreview(file('image/png', PREVIEW_SOURCE_MAX_BYTES))).toBe(true);
    expect(canPreview(file('image/png', PREVIEW_SOURCE_MAX_BYTES + 1))).toBe(false);
  });

  it('never treats SVG or a non-picture as one', () => {
    expect(canPreview(file('image/svg+xml', 1000))).toBe(false);
    expect(canPreview(file('video/mp4', 1000))).toBe(false);
  });
});
