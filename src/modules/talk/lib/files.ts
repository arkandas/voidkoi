/**
 * How big a shared picture is drawn in the chat and the Files page, and what
 * a file's icon goes by. Kept free of React so it can be tested directly.
 * Icons and extensions come from `@/lib/file-types`.
 */
import type { Attachment } from './protocol';

export interface Size {
  width: number;
  height: number;
}

/**
 * Shrink a picture so its longest side is at most `edge`, keeping its shape.
 * Never enlarges, and never rounds a side down to nothing.
 */
export function fitWithin(size: Size, edge: number): Size {
  if (size.width <= 0 || size.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, edge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * The type a shared file's icon goes by: a picture's, which the server read
 * from its bytes. Anything else has none, and its name decides: what the
 * sender's browser said it was is never taken.
 */
export function iconType(file: Pick<Attachment, 'isImage' | 'contentType'>): string | null {
  return file.isImage ? file.contentType : null;
}

/** About the width WhatsApp gives a photo on a phone; the bubble caps it narrower still. */
const BUBBLE_IMAGE_LIMITS = {
  maxWidth: 280,
  maxHeight: 320,
  /** Neither side drawn smaller than this, so a thin strip is still a target. */
  minSide: 96,
};

/**
 * The box a picture is drawn in inside a bubble, in CSS pixels.
 *
 * Worked out from the original's size before anything has loaded, so the
 * transcript does not jump as pictures arrive. Very long or very tall pictures
 * are cropped (object-cover) to a box no thinner than `minSide`, rather than
 * becoming a sliver.
 */
export function bubbleImageSize(size: Size | null): Size {
  const { maxWidth, maxHeight, minSide } = BUBBLE_IMAGE_LIMITS;
  if (!size || size.width <= 0 || size.height <= 0) {
    return { width: maxWidth, height: Math.round((maxWidth * 3) / 4) };
  }
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  return {
    width: Math.min(maxWidth, Math.max(minSide, width)),
    height: Math.min(maxHeight, Math.max(minSide, height)),
  };
}
