/**
 * What a file really is, from its first bytes. A browser says what it sends,
 * but none of that is trusted: only a picture by its bytes is ever shown in
 * the page, and only as the type its bytes say.
 *
 * SVG has no magic number and can carry script, so it is never one of them.
 */
import { FILE_NAME_MAX } from '@/modules/talk/lib/protocol';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function isAscii(bytes: Uint8Array, text: string, offset: number): boolean {
  if (bytes.length < offset + text.length) return false;
  return [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

export type StillImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/** A PNG, JPEG or WebP (a RIFF container: "RIFF", four bytes of length, "WEBP"), or null. */
export function sniffImageType(bytes: Uint8Array): StillImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (isAscii(bytes, 'RIFF', 0) && isAscii(bytes, 'WEBP', 8)) return 'image/webp';
  return null;
}

/** A shared file the page may show as a picture: those, and GIF. Everything else is only a download. */
export type ViewableImageType = StillImageType | 'image/gif';

export function sniffViewableImage(bytes: Uint8Array): ViewableImageType | null {
  if (isAscii(bytes, 'GIF87a', 0) || isAscii(bytes, 'GIF89a', 0)) return 'image/gif';
  return sniffImageType(bytes);
}

/**
 * The name as the sender's device had it, made safe to keep and hand back: no
 * folders, no control characters, no invisible format characters (like the
 * ones that turn text right to left, which can make an .exe read as a .pdf),
 * not endless. A long name keeps its extension, which is the part that says
 * what the file is.
 */
export function cleanFileName(raw: string | null | undefined): string {
  let name: string;
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = raw ?? '';
  }
  name = name.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/^.*[/\\]/, '').trim();
  if (name === '' || name === '.' || name === '..') return 'file';

  const characters = [...name];
  if (characters.length <= FILE_NAME_MAX) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  return `${characters.slice(0, FILE_NAME_MAX - [...extension].length - 1).join('')}…${extension}`;
}

/** The browser's word for what a file is, if it looks like one. Kept as said; nothing goes by it, not even the icon. */
export function cleanContentType(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(value) && value.length <= 100 ? value : 'application/octet-stream';
}
