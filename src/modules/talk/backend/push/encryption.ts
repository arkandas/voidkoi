/**
 * Web Push message encryption: RFC 8291, over the `aes128gcm` content coding
 * of RFC 8188.
 *
 * Every notification is encrypted to the one device that asked for it, with a
 * fresh key pair and salt each time, so the push service carrying it — Apple's,
 * Google's or Mozilla's — delivers it without being able to read it.
 *
 * Only node:crypto: the whole scheme is an ECDH, three HKDFs and one AES-GCM.
 */
import { createCipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

/** One record is plenty: a notification is far smaller than this. */
const RECORD_SIZE = 4096;
const SALT_BYTES = 16;
const TAG_BYTES = 16;
const P256_POINT_BYTES = 65;
const AUTH_SECRET_BYTES = 16;
/** salt (16) + record size (4) + key id length (1) + the key id itself (65). */
const HEADER_BYTES = SALT_BYTES + 4 + 1 + P256_POINT_BYTES;

/**
 * 4096 bytes is the most every push service promises to carry, header and
 * padding delimiter and tag included.
 */
export const MAX_PLAINTEXT_BYTES = RECORD_SIZE - HEADER_BYTES - 1 - TAG_BYTES;

export interface SubscriptionKeys {
  /** The device's P-256 public key, uncompressed, base64url. */
  p256dh: string;
  /** Sixteen random bytes the device shares with the server, base64url. */
  auth: string;
}

export interface EncryptOptions {
  /** Fixed for the RFC's worked example; random otherwise, and it must be. */
  salt?: Buffer;
  serverPrivateKey?: Buffer;
}

export class PushKeyError extends Error {}

/** Check a subscription's keys before anything is stored or sent to it. */
export function decodeSubscriptionKeys(keys: SubscriptionKeys): { uaPublic: Buffer; authSecret: Buffer } {
  const uaPublic = Buffer.from(keys.p256dh, 'base64url');
  const authSecret = Buffer.from(keys.auth, 'base64url');
  if (uaPublic.length !== P256_POINT_BYTES || uaPublic[0] !== 0x04) {
    throw new PushKeyError('p256dh must be an uncompressed P-256 public key.');
  }
  if (authSecret.length !== AUTH_SECRET_BYTES) {
    throw new PushKeyError('auth must be 16 bytes.');
  }
  return { uaPublic, authSecret };
}

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, length));

export function encryptPayload(
  plaintext: Buffer,
  keys: SubscriptionKeys,
  options: EncryptOptions = {},
): Buffer {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new PushKeyError(`A push message holds at most ${MAX_PLAINTEXT_BYTES} bytes.`);
  }
  const { uaPublic, authSecret } = decodeSubscriptionKeys(keys);

  // An ephemeral key pair for this message alone.
  const ecdh = createECDH('prime256v1');
  if (options.serverPrivateKey) ecdh.setPrivateKey(options.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // Mix in the device's auth secret, then derive the key and nonce.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  // A single record, so it is also the last one: its padding delimiter is 2.
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(SALT_BYTES + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
  header.writeUInt8(asPublic.length, SALT_BYTES + 4);

  return Buffer.concat([header, asPublic, ciphertext]);
}
