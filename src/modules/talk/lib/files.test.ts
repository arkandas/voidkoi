import { describe, expect, it } from 'vitest';

import { fileKind } from '@/lib/file-types';

import { bubbleImageSize, fitWithin, iconType } from './files';
import { PREVIEW_MAX_EDGE } from './protocol';

describe('preview size', () => {
  it('shrinks the longest side to the edge, keeping the shape', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, PREVIEW_MAX_EDGE)).toEqual({
      width: 640,
      height: 480,
    });
    expect(fitWithin({ width: 1080, height: 1920 }, PREVIEW_MAX_EDGE)).toEqual({
      width: 360,
      height: 640,
    });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin({ width: 200, height: 100 }, PREVIEW_MAX_EDGE)).toEqual({
      width: 200,
      height: 100,
    });
  });

  it('keeps a hair-thin picture at least a pixel wide', () => {
    expect(fitWithin({ width: 10_000, height: 2 }, PREVIEW_MAX_EDGE)).toEqual({
      width: 640,
      height: 1,
    });
  });

  it('gives nothing for nothing', () => {
    expect(fitWithin({ width: 0, height: 100 }, 640)).toEqual({ width: 0, height: 0 });
  });
});

describe('the box a picture takes in a bubble', () => {
  it('fits a landscape photo to the width', () => {
    expect(bubbleImageSize({ width: 4000, height: 3000 })).toEqual({ width: 280, height: 210 });
  });

  it('fits a portrait photo to the height', () => {
    expect(bubbleImageSize({ width: 1080, height: 1920 })).toEqual({ width: 180, height: 320 });
  });

  it('crops a panorama to a box that is still a target', () => {
    expect(bubbleImageSize({ width: 8000, height: 400 })).toEqual({ width: 280, height: 96 });
  });

  it('gives a tiny picture a box of the minimum size', () => {
    expect(bubbleImageSize({ width: 32, height: 32 })).toEqual({ width: 96, height: 96 });
  });

  it('reserves a 4:3 box when the size is unknown', () => {
    expect(bubbleImageSize(null)).toEqual({ width: 280, height: 210 });
  });
});

describe('the type a file’s icon goes by', () => {
  it('is a picture’s, as the server read it from the bytes', () => {
    expect(iconType({ isImage: true, contentType: 'image/png' })).toBe('image/png');
  });

  it('is none for anything else, so the name decides and the sender’s word counts for nothing', () => {
    const program = { isImage: false, contentType: 'application/pdf' };
    expect(iconType(program)).toBeNull();
    expect(fileKind(iconType(program), 'invoice.exe')).toBe('file');
    expect(fileKind(iconType({ isImage: false, contentType: 'image/png' }), 'notes.pdf')).toBe('pdf');
  });
});
