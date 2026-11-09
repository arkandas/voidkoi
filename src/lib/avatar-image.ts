/**
 * Turning a chosen file into a small square the server will accept.
 *
 * Cropping happens in the browser with canvas, so a multi-megabyte photo never
 * crosses the wire. The server decodes and encodes what arrives again, so this
 * is a convenience, not a security boundary.
 *
 * The geometry below is separated from the React that drives it so the awkward
 * part — which pixels of the original end up in the square — can be tested
 * directly rather than by dragging things about.
 */
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from '@/lib/avatar';

type AvatarContentType = 'image/webp' | 'image/png' | 'image/jpeg';

/** Refuse obvious nonsense before decoding it. A camera photo is a few MB. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** The selection can never get smaller than this, in source pixels. */
export const MIN_SELECTION = 32;

/**
 * The longest edge the editor ever *displays*.
 *
 * A photograph straight off a phone is 24 megapixels. Handing that to an
 * `<img>` in a 440px box means the browser resamples all 24 million pixels on
 * every frame of a drag, which takes seconds per frame. The editor gets a
 * downscaled copy instead; the original is kept for the final crop, so
 * selecting a small region still comes out sharp.
 */
const MAX_PREVIEW_EDGE = 1600;

/**
 * The longest edge of the copy the little round preview is drawn from.
 *
 * The preview is redrawn on every frame of a drag. Scaling a 1600px bitmap
 * down to 128px is a wide enough reduction that Chrome drops off the GPU path
 * and resamples on the CPU, which costs milliseconds per frame for a thumbnail
 * nobody is inspecting closely. Drawing from a 256px copy instead is free.
 */
const MAX_THUMB_EDGE = 256;

/**
 * Encoder settings, tried in order until one fits the cap.
 *
 * WebP first: it is roughly half the size of the equivalent JPEG. Dropping
 * quality is much better than refusing the upload, which is what a fixed
 * quality does the moment somebody picks a busy photograph.
 */
const ENCODINGS: ReadonlyArray<readonly [AvatarContentType, number]> = [
  ['image/webp', 0.86],
  ['image/webp', 0.72],
  ['image/webp', 0.58],
  ['image/jpeg', 0.86],
  ['image/jpeg', 0.7],
  ['image/jpeg', 0.55],
  ['image/jpeg', 0.4],
];

/** Why a picture could not be used, for the editor to say in the reader's language. */
export type AvatarErrorReason = 'notAnImage' | 'tooLarge' | 'unreadable' | 'cannotResize' | 'cannotConvert';

export class AvatarError extends Error {
  constructor(readonly reason: AvatarErrorReason) {
    super(`Avatar image rejected: ${reason}`);
  }
}

export interface PreparedAvatar {
  /** base64, no `data:` prefix. */
  image: string;
  contentType: AvatarContentType;
}

/** The picture the editor works with. */
export interface AvatarSource {
  /** The original's dimensions, which the selection is expressed in. */
  readonly width: number;
  readonly height: number;
  /** A small copy, drawn straight to a canvas by the editor. */
  readonly display: CanvasImageSource;
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** A much smaller copy, for the preview that is redrawn while dragging. */
  readonly thumb: CanvasImageSource;
  readonly thumbWidth: number;
  /**
   * Decode the original, on demand.
   *
   * Deliberately not done when the editor opens: decoding 25 megapixels costs
   * about 100MB and the better part of a second on a real photograph, and it
   * is only needed once, when the crop is saved.
   */
  loadOriginal(): Promise<CanvasImageSource>;
  release(): void;
}

/** A square of the *original* image, in its own pixels. */
export interface CropRect {
  x: number;
  y: number;
  size: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Which handle is being dragged. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Where the whole image sits inside a box, letterboxed to fit.
 *
 * The editor shows the entire picture rather than a window onto it, so the
 * crop square can be dragged anywhere across it.
 */
export function fitRect(
  image: Size,
  box: Size,
): { x: number; y: number; width: number; height: number; scale: number } {
  if (image.width === 0 || image.height === 0 || box.width === 0 || box.height === 0) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 1 };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height, scale };
}

/** Keep a square selection inside the image, and above the minimum size. */
export function clampSelection(selection: CropRect, image: Size): CropRect {
  const limit = Math.min(image.width, image.height);
  const size = Math.min(Math.max(MIN_SELECTION, selection.size), limit);
  return {
    size,
    x: Math.min(Math.max(0, selection.x), image.width - size),
    y: Math.min(Math.max(0, selection.y), image.height - size),
  };
}

/** The square the editor opens with: the largest centred one. */
export function defaultSelection(image: Size): CropRect {
  const size = Math.min(image.width, image.height);
  return { x: (image.width - size) / 2, y: (image.height - size) / 2, size };
}

/** Slide the selection without changing its size. */
export function moveSelection(selection: CropRect, by: Point, image: Size): CropRect {
  return clampSelection({ ...selection, x: selection.x + by.x, y: selection.y + by.y }, image);
}

/**
 * Resize from one corner, keeping it square and inside the image.
 *
 * The opposite corner is the anchor and does not move — which is what makes a
 * corner handle feel right. The new side is the larger of the two distances
 * from the anchor to the pointer, so the square follows the diagonal rather
 * than sticking to whichever axis happens to be shorter.
 */
export function resizeSelection(
  selection: CropRect,
  corner: Corner,
  pointer: Point,
  image: Size,
): CropRect {
  const growsRight = corner === 'ne' || corner === 'se';
  const growsDown = corner === 'se' || corner === 'sw';

  const anchorX = growsRight ? selection.x : selection.x + selection.size;
  const anchorY = growsDown ? selection.y : selection.y + selection.size;

  // How far the anchor can reach before running off the edge.
  const roomX = growsRight ? image.width - anchorX : anchorX;
  const roomY = growsDown ? image.height - anchorY : anchorY;

  const wanted = Math.max(Math.abs(pointer.x - anchorX), Math.abs(pointer.y - anchorY));
  const size = Math.min(Math.max(MIN_SELECTION, wanted), Math.min(roomX, roomY));

  return {
    size,
    x: growsRight ? anchorX : anchorX - size,
    y: growsDown ? anchorY : anchorY - size,
  };
}

/** The square used when there is no editor: dead centre. */
export function centreCrop(width: number, height: number): CropRect {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/* ------------------------------------------------------------------ */
/* Decoding and encoding                                               */
/* ------------------------------------------------------------------ */

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new AvatarError('unreadable'));
      element.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dimensions only. The browser parses the header without rastering the image. */
export async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const image = await loadImage(file);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

/** Full-resolution decode, honouring EXIF rotation where the browser allows. */
async function decodeFull(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older browsers reject the options bag; fall through.
    }
  }
  const image = await loadImage(file);
  return Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight });
}

/**
 * Decode straight to the size the editor shows.
 *
 * `createImageBitmap` with a resize lets the decoder downsample as it goes —
 * a JPEG can be scaled during the DCT pass — so the full-size bitmap is never
 * built. This is the difference between the crop square appearing at once and
 * appearing a second later.
 */
export async function decodeForDisplay(
  file: File,
  width: number,
  height: number,
  edge: number = MAX_PREVIEW_EDGE,
): Promise<{ display: CanvasImageSource; width: number; height: number }> {
  const scale = Math.min(1, edge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      return { display: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to decoding fully and scaling by hand.
    }
  }

  const full = await decodeFull(file);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarError('cannotResize');
  context.imageSmoothingQuality = 'high';
  context.drawImage(full, 0, 0, targetWidth, targetHeight);
  if (typeof ImageBitmap !== 'undefined' && full instanceof ImageBitmap) full.close();
  return { display: canvas, width: targetWidth, height: targetHeight };
}

/** A smaller copy of something already decoded, for the live preview. */
async function shrink(
  image: CanvasImageSource,
  width: number,
  height: number,
  edge: number,
): Promise<{ image: CanvasImageSource; width: number; height: number }> {
  const scale = Math.min(1, edge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (typeof createImageBitmap === 'function' && typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    try {
      const bitmap = await createImageBitmap(image, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: 'medium',
      });
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to the canvas path.
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) return { image, width, height };
  context.imageSmoothingQuality = 'medium';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return { image: canvas, width: targetWidth, height: targetHeight };
}

/** Open a chosen file, ready for the editor. Call `release()` when done. */
export async function loadAvatarSource(file: File): Promise<AvatarSource> {
  if (!file.type.startsWith('image/')) throw new AvatarError('notAnImage');
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarError('tooLarge');

  const { width, height } = await readDimensions(file);
  if (width === 0 || height === 0) {
    throw new AvatarError('unreadable');
  }

  const copy = await decodeForDisplay(file, width, height);
  const thumb = await shrink(copy.display, copy.width, copy.height, MAX_THUMB_EDGE);
  let original: CanvasImageSource | null = null;

  return {
    width,
    height,
    display: copy.display,
    displayWidth: copy.width,
    displayHeight: copy.height,
    thumb: thumb.image,
    thumbWidth: thumb.width,
    async loadOriginal() {
      // Cached: saving twice should not decode twice.
      original ??= await decodeFull(file);
      return original;
    },
    release() {
      if (typeof ImageBitmap !== 'undefined') {
        if (copy.display instanceof ImageBitmap) copy.display.close();
        if (thumb.image instanceof ImageBitmap) thumb.image.close();
        if (original instanceof ImageBitmap) original.close();
      }
    },
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // btoa wants a binary string, and spreading tens of thousands of bytes at
  // once blows the argument limit, so chunk it.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Draw the chosen square at the stored size and encode it, stepping the
 * quality down until it fits.
 *
 * Whatever the source was — a 12 megapixel photograph or a 40×40 icon — what
 * leaves here is AVATAR_SIZE square and a few kilobytes.
 */
export async function encodeAvatar(source: AvatarSource, crop: CropRect): Promise<PreparedAvatar> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new AvatarError('cannotResize');
  context.imageSmoothingQuality = 'high';
  // Full resolution, so a small selection still comes out sharp. This is the
  // one place the original is needed, and the only place it is decoded.
  context.drawImage(
    await source.loadOriginal(),
    crop.x,
    crop.y,
    crop.size,
    crop.size,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  const blob = await encodeWithin(canvas, AVATAR_MAX_BYTES);
  if (!blob) throw new AvatarError('cannotConvert');
  return { image: await toBase64(blob), contentType: blob.type as AvatarContentType };
}

/**
 * Encode a canvas as WebP, or JPEG where the browser cannot, stepping the
 * quality down until it fits in `maxBytes`. Null when nothing fits. Shared
 * with the previews of pictures sent in a chat.
 */
export async function encodeWithin(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  for (const [type, quality] of ENCODINGS) {
    const blob = await toBlob(canvas, type, quality);
    // A browser that cannot encode this type quietly returns a PNG instead.
    if (!blob || blob.type !== type) continue;
    if (blob.size > maxBytes) continue;
    return blob;
  }
  return null;
}
