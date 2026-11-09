/**
 * The small copy of a picture that the chat and the Files page show, made in
 * the sender's browser so the server never has to decode anybody's photos.
 *
 * Best effort by design: a picture this browser cannot decode (HEIC in
 * Chrome, say) simply has no preview, and is still sent as a file.
 */
import { decodeForDisplay, encodeWithin, readDimensions } from '@/lib/avatar-image';

import { fitWithin } from './files';
import { PREVIEW_MAX_BYTES, PREVIEW_MAX_EDGE } from './protocol';

export interface PreparedPreview {
  blob: Blob;
  /** The original's size in pixels, which the server stores with the file. */
  width: number;
  height: number;
}

/**
 * Past this, a picture goes without a preview. Decoding means holding every
 * pixel in memory at once, and a huge scan or panorama could stall or crash
 * the tab; it is still sent, as a file.
 */
export const PREVIEW_SOURCE_MAX_BYTES = 50 * 1024 * 1024;

/** SVG is a document, not a picture; the server never shows one inline. */
export function canPreview(file: File): boolean {
  return (
    file.type.startsWith('image/') &&
    file.type !== 'image/svg+xml' &&
    file.size <= PREVIEW_SOURCE_MAX_BYTES
  );
}

export async function makePreview(file: File): Promise<PreparedPreview | null> {
  if (!canPreview(file)) return null;
  try {
    const { width, height } = await readDimensions(file);
    if (width === 0 || height === 0) return null;

    const target = fitWithin({ width, height }, PREVIEW_MAX_EDGE);
    const decoded = await decodeForDisplay(file, width, height, PREVIEW_MAX_EDGE);

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.display, 0, 0, target.width, target.height);
    if (typeof ImageBitmap !== 'undefined' && decoded.display instanceof ImageBitmap) {
      decoded.display.close();
    }

    const blob = await encodeWithin(canvas, PREVIEW_MAX_BYTES);
    return blob ? { blob, width, height } : null;
  } catch {
    return null;
  }
}
