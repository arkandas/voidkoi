import CryptoJS from 'crypto-js';

export const HASH_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];
export type HashResults = Record<HashAlgorithm, string>;

export const HASH_LABELS: Record<HashAlgorithm, string> = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

type HashInput = string | CryptoJS.lib.WordArray;

function hashAll(input: HashInput): HashResults {
  return {
    md5: CryptoJS.MD5(input).toString(),
    sha1: CryptoJS.SHA1(input).toString(),
    sha256: CryptoJS.SHA256(input).toString(),
    sha384: CryptoJS.SHA384(input).toString(),
    sha512: CryptoJS.SHA512(input).toString(),
  };
}

export function hashText(text: string): HashResults {
  return hashAll(text);
}

export function hashBytes(buffer: ArrayBuffer): HashResults {
  return hashAll(CryptoJS.lib.WordArray.create(buffer));
}

export async function hashFile(file: File): Promise<HashResults> {
  return hashBytes(await file.arrayBuffer());
}

export function formatHashes(hashes: HashResults): string {
  return HASH_ALGORITHMS.map(algorithm => `${HASH_LABELS[algorithm]}: ${hashes[algorithm]}`).join('\n');
}
