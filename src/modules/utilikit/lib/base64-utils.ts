const CHUNK_SIZE = 3 * 8192;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export type Base64Error = 'invalidBase64' | 'notText';
export type Base64DecodeResult = { ok: true; text: string } | { ok: false; error: Base64Error };

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))));
  }
  return chunks.join('');
}

export function base64ToBytes(input: string): Uint8Array | null {
  try {
    const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function decodeFromBase64(input: string): Base64DecodeResult {
  const bytes = base64ToBytes(input);
  if (!bytes) return { ok: false, error: 'invalidBase64' };

  try {
    return { ok: true, text: utf8.decode(bytes) };
  } catch {
    return { ok: false, error: 'notText' };
  }
}

export async function encodeFileToBase64(file: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}
