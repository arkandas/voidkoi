import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  calculateOutputSize,
  clampQuality,
  cropToPixels,
  dataUrlByteLength,
  DEFAULT_QUALITY,
  EncodingSettings,
  formatFromDataUrl,
  formatFromMimeType,
  IMAGE_FORMATS,
  isHeicFile,
  isImageFile,
  MAX_QUALITY,
  mimeTypeForFormat,
  MIN_QUALITY,
  parseDimension,
  replaceExtension,
  resolveEncoding,
  syncAspectRatio,
} from '@/modules/utilikit/lib/image-utils';

describe('calculateOutputSize', () => {
  const photo = { width: 4032, height: 3024 };

  it('keeps the source size when no resize is requested', () => {
    expect(calculateOutputSize(photo)).toEqual(photo);
    expect(calculateOutputSize(photo, {})).toEqual(photo);
  });

  it('derives the height of a 4:3 image exactly from its width', () => {
    for (let width = 4; width <= photo.width; width += 4) {
      expect(calculateOutputSize(photo, { width })).toEqual({ width, height: (width / 4) * 3 });
    }
  });

  it('derives the width of a 16:9 image exactly from its height', () => {
    const video = { width: 1920, height: 1080 };
    for (let height = 9; height <= 2160; height += 9) {
      expect(calculateOutputSize(video, { height })).toEqual({ width: (height / 9) * 16, height });
    }
  });

  it('rounds the derived side to the nearest pixel', () => {
    expect(calculateOutputSize({ width: 1000, height: 333 }, { width: 500 })).toEqual({ width: 500, height: 167 });
    expect(calculateOutputSize({ width: 1000, height: 333 }, { width: 100 })).toEqual({ width: 100, height: 33 });
    expect(calculateOutputSize({ width: 3, height: 2 }, { height: 1 })).toEqual({ width: 2, height: 1 });
  });

  it('uses both sides as given, even when that changes the aspect ratio', () => {
    expect(calculateOutputSize(photo, { width: 100, height: 100 })).toEqual({ width: 100, height: 100 });
    expect(calculateOutputSize(photo, { width: 100, height: 100, maintainAspectRatio: false })).toEqual({
      width: 100,
      height: 100,
    });
  });

  it('leaves the other side untouched when the aspect ratio is not maintained', () => {
    expect(calculateOutputSize(photo, { width: 800, maintainAspectRatio: false })).toEqual({ width: 800, height: 3024 });
    expect(calculateOutputSize(photo, { height: 600, maintainAspectRatio: false })).toEqual({ width: 4032, height: 600 });
  });

  it('never collapses the derived side below one pixel', () => {
    expect(calculateOutputSize({ width: 5000, height: 10 }, { width: 100 })).toEqual({ width: 100, height: 1 });
    expect(calculateOutputSize({ width: 10, height: 5000 }, { height: 100 })).toEqual({ width: 1, height: 100 });
  });

  it('ignores zero, negative, sub-pixel and non-finite targets', () => {
    for (const value of [0, -100, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculateOutputSize(photo, { width: value })).toEqual(photo);
      expect(calculateOutputSize(photo, { width: 800, height: value })).toEqual({ width: 800, height: 600 });
    }
  });

  it('rounds fractional targets to whole pixels', () => {
    expect(calculateOutputSize(photo, { width: 799.6, height: 600.2 })).toEqual({ width: 800, height: 600 });
  });
});

describe('syncAspectRatio', () => {
  const photo = { width: 4000, height: 3000 };

  it('recomputes the height when the width is edited', () => {
    expect(syncAspectRatio({ width: '800', height: '3000' }, 'width', photo)).toEqual({ width: '800', height: '600' });
  });

  it('recomputes the width when the height is edited', () => {
    expect(syncAspectRatio({ width: '4000', height: '1500' }, 'height', photo)).toEqual({
      width: '2000',
      height: '1500',
    });
  });

  it('keeps the edited text exactly as typed', () => {
    expect(syncAspectRatio({ width: ' 0800', height: '1' }, 'width', photo)).toEqual({ width: ' 0800', height: '600' });
  });

  it('leaves both fields alone while the edited value is not a valid size', () => {
    for (const width of ['', '0', 'abc', '-5', '12.5']) {
      const inputs = { width, height: '3000' };
      expect(syncAspectRatio(inputs, 'width', photo)).toEqual(inputs);
    }
  });

  it('scales from the cropped size rather than the original', () => {
    expect(syncAspectRatio({ width: '500', height: '' }, 'width', { width: 1000, height: 1000 })).toEqual({
      width: '500',
      height: '500',
    });
  });
});

describe('parseDimension', () => {
  it('accepts positive whole numbers, ignoring surrounding spaces', () => {
    expect(parseDimension('800')).toBe(800);
    expect(parseDimension(' 1920 ')).toBe(1920);
    expect(parseDimension('007')).toBe(7);
  });

  it('rejects empty, zero, negative, fractional, non-numeric and unsafe input', () => {
    for (const value of ['', '   ', '0', '000', '-5', '12.5', '1e3', '12px', 'abc', '99999999999999999999']) {
      expect(parseDimension(value)).toBeUndefined();
    }
  });
});

describe('cropToPixels', () => {
  const photo = { width: 4000, height: 3000 };

  it('maps the full selection to the whole image', () => {
    expect(cropToPixels({ x: 0, y: 0, width: 100, height: 100 }, photo)).toEqual({ x: 0, y: 0, ...photo });
  });

  it('maps the default centred selection to source pixels', () => {
    expect(cropToPixels({ x: 25, y: 25, width: 50, height: 50 }, photo)).toEqual({
      x: 1000,
      y: 750,
      width: 2000,
      height: 1500,
    });
  });

  it('rounds each edge to the nearest pixel on odd sizes', () => {
    expect(cropToPixels({ x: 25, y: 25, width: 50, height: 50 }, { width: 1001, height: 3 })).toEqual({
      x: 250,
      y: 1,
      width: 501,
      height: 1,
    });
  });

  it('splits an image into adjacent crops without gaps or overlaps', () => {
    for (const width of [7, 100, 1001, 4032]) {
      const source = { width, height: 10 };
      const left = cropToPixels({ x: 0, y: 0, width: 100 / 3, height: 100 }, source);
      const right = cropToPixels({ x: 100 / 3, y: 0, width: 200 / 3, height: 100 }, source);
      expect(right.x).toBe(left.width);
      expect(left.width + right.width).toBe(width);
    }
  });

  it('clamps selections that spill over the image edges', () => {
    expect(cropToPixels({ x: 90, y: -10, width: 20, height: 50 }, { width: 100, height: 100 })).toEqual({
      x: 90,
      y: 0,
      width: 10,
      height: 40,
    });
  });

  it('returns an empty area for a zero-size selection', () => {
    expect(cropToPixels({ x: 50, y: 50, width: 0, height: 0 }, photo)).toEqual({
      x: 2000,
      y: 1500,
      width: 0,
      height: 0,
    });
  });
});

describe('replaceExtension', () => {
  it('swaps the last extension', () => {
    expect(replaceExtension('photo.png', 'webp')).toBe('photo.webp');
    expect(replaceExtension('IMG_1234.HEIC', 'jpg')).toBe('IMG_1234.jpg');
    expect(replaceExtension('holiday.2024.final.jpeg', 'png')).toBe('holiday.2024.final.png');
  });

  it('adds an extension when there is none', () => {
    expect(replaceExtension('scan', 'png')).toBe('scan.png');
    expect(replaceExtension('photo.', 'png')).toBe('photo.png');
  });

  it('treats a leading dot as part of the name', () => {
    expect(replaceExtension('.cover', 'png')).toBe('.cover.png');
  });

  it('falls back to a generic name when the name is empty', () => {
    expect(replaceExtension('', 'webp')).toBe('image.webp');
  });
});

describe('isHeicFile', () => {
  it('detects HEIC and HEIF by extension, whatever the case', () => {
    expect(isHeicFile({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isHeicFile({ name: 'photo.heif', type: 'application/octet-stream' })).toBe(true);
  });

  it('detects HEIC and HEIF by MIME type', () => {
    expect(isHeicFile({ name: 'blob', type: 'image/heic' })).toBe(true);
    expect(isHeicFile({ name: 'blob', type: 'image/HEIF' })).toBe(true);
  });

  it('rejects other images and names that merely contain "heic"', () => {
    expect(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
    expect(isHeicFile({ name: 'heic.png', type: 'image/png' })).toBe(false);
    expect(isHeicFile({ name: 'photo.heic.zip', type: 'application/zip' })).toBe(false);
  });
});

describe('isImageFile', () => {
  it('accepts any image MIME type and HEIC files without one', () => {
    expect(isImageFile({ name: 'a.png', type: 'image/png' })).toBe(true);
    expect(isImageFile({ name: 'a.gif', type: 'image/gif' })).toBe(true);
    expect(isImageFile({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
  });

  it('rejects files that are not images', () => {
    expect(isImageFile({ name: 'report.pdf', type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
    expect(isImageFile({ name: 'unknown', type: '' })).toBe(false);
  });
});

describe('format and MIME mapping', () => {
  it('uses the registered MIME type for every output format', () => {
    expect(IMAGE_FORMATS.map(format => mimeTypeForFormat(format))).toEqual(['image/webp', 'image/png', 'image/jpeg']);
  });

  it('round-trips every output format through its MIME type', () => {
    for (const format of IMAGE_FORMATS) {
      expect(formatFromMimeType(mimeTypeForFormat(format))).toBe(format);
    }
  });

  it('normalises aliases, case and parameters', () => {
    expect(formatFromMimeType('image/jpg')).toBe('jpeg');
    expect(formatFromMimeType('IMAGE/PNG')).toBe('png');
    expect(formatFromMimeType('image/webp; charset=binary')).toBe('webp');
  });

  it('returns null for types it cannot write', () => {
    for (const type of ['image/gif', 'image/bmp', 'image/heic', 'image/svg+xml', 'text/plain', '']) {
      expect(formatFromMimeType(type)).toBeNull();
    }
  });

  it('reads the format a canvas actually produced from its data URL', () => {
    expect(formatFromDataUrl('data:image/webp;base64,UklGRg==')).toBe('webp');
    expect(formatFromDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('png');
    expect(formatFromDataUrl('data:,')).toBeNull();
    expect(formatFromDataUrl('image/png')).toBeNull();
  });
});

describe('dataUrlByteLength', () => {
  it('matches the decoded payload size for every padding length', () => {
    for (let length = 0; length <= 64; length++) {
      const bytes = Buffer.alloc(length, 0xab);
      expect(dataUrlByteLength(`data:image/png;base64,${bytes.toString('base64')}`)).toBe(length);
    }
  });

  it('returns 0 for an empty canvas export or a string without a payload', () => {
    expect(dataUrlByteLength('data:,')).toBe(0);
    expect(dataUrlByteLength('not a data url')).toBe(0);
  });
});

describe('clampQuality', () => {
  it('stays within the 0–1 range the canvas encoder accepts', () => {
    expect(MIN_QUALITY).toBeGreaterThan(0);
    expect(MAX_QUALITY).toBeLessThanOrEqual(1);
    expect(DEFAULT_QUALITY).toBeGreaterThanOrEqual(MIN_QUALITY);
    expect(DEFAULT_QUALITY).toBeLessThanOrEqual(MAX_QUALITY);
  });

  it('keeps values inside the supported range', () => {
    expect(clampQuality(0.75)).toBe(0.75);
    expect(clampQuality(MIN_QUALITY)).toBe(MIN_QUALITY);
    expect(clampQuality(MAX_QUALITY)).toBe(MAX_QUALITY);
  });

  it('clamps values outside the range', () => {
    expect(clampQuality(0)).toBe(MIN_QUALITY);
    expect(clampQuality(-1)).toBe(MIN_QUALITY);
    expect(clampQuality(1.5)).toBe(MAX_QUALITY);
    expect(clampQuality(Number.POSITIVE_INFINITY)).toBe(MAX_QUALITY);
  });

  it('falls back to the default for NaN', () => {
    expect(clampQuality(Number.NaN)).toBe(DEFAULT_QUALITY);
  });
});

describe('resolveEncoding', () => {
  const base: EncodingSettings = { format: 'webp', quality: 0.8, keepOriginalFormat: false };
  const keep: EncodingSettings = { ...base, keepOriginalFormat: true };

  it('uses the chosen format and quality', () => {
    expect(resolveEncoding(base, 'image/png')).toEqual({ format: 'webp', quality: 0.8 });
    expect(resolveEncoding({ ...base, format: 'jpeg' }, 'image/png')).toEqual({ format: 'jpeg', quality: 0.8 });
  });

  it('always encodes PNG at full quality', () => {
    expect(resolveEncoding({ ...base, format: 'png' }, 'image/jpeg')).toEqual({ format: 'png', quality: 1 });
  });

  it('clamps an out-of-range quality', () => {
    expect(resolveEncoding({ ...base, quality: 3 }, 'image/png').quality).toBe(MAX_QUALITY);
    expect(resolveEncoding({ ...base, quality: 0 }, 'image/png').quality).toBe(MIN_QUALITY);
  });

  it('keeps the source format at full quality when asked to', () => {
    expect(resolveEncoding(keep, 'image/jpeg')).toEqual({ format: 'jpeg', quality: 1 });
    expect(resolveEncoding(keep, 'image/png')).toEqual({ format: 'png', quality: 1 });
    expect(resolveEncoding(keep, 'image/webp')).toEqual({ format: 'webp', quality: 1 });
  });

  it('falls back to the chosen format when the source format cannot be written', () => {
    expect(resolveEncoding(keep, 'image/gif')).toEqual({ format: 'webp', quality: 1 });
    expect(resolveEncoding({ ...keep, format: 'png' }, 'image/bmp')).toEqual({ format: 'png', quality: 1 });
  });
});
