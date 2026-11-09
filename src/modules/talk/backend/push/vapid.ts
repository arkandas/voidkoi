/**
 * VAPID (RFC 8292): how a push service knows a notification comes from the
 * server a device subscribed to, and no one else.
 *
 * The server holds one P-256 key pair. Its public half is the
 * `applicationServerKey` a browser subscribes with; every request to a push
 * service then carries a short-lived JWT signed with the private half.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url. */
  publicKey: string;
  privateKey: KeyObject;
}

/** The pair as it is stored: both halves as base64url text. */
export interface StoredVapidKeys {
  public_key: string;
  private_key: string;
}

/** An EC public key as the 65-byte uncompressed point browsers expect. */
function uncompressedPoint(key: KeyObject): string {
  const jwk = key.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y) throw new Error('not an EC key');
  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]).toString('base64url');
}

export function generateVapidKeys(): StoredVapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    public_key: uncompressedPoint(createPublicKey(privateKey)),
    private_key: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
  };
}

export function loadVapidKeys(stored: StoredVapidKeys): VapidKeys {
  const privateKey = createPrivateKey({
    key: Buffer.from(stored.private_key, 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
  // Derived rather than trusted: a mismatched pair would fail every request.
  const publicKey = uncompressedPoint(createPublicKey(privateKey));
  if (publicKey !== stored.public_key) throw new Error('push_keys: public and private keys do not match');
  return { publicKey, privateKey };
}

/** Well inside the 24 hours RFC 8292 allows. */
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

/**
 * The `Authorization` header for one request to one push service.
 *
 * The token names the push service's origin as its audience, so it is only
 * good there, and names the server's operator as its subject, so the push
 * service has somebody to contact.
 */
export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: number = Date.now(),
): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
    sub: subject,
  })}`;
  // JOSE wants the raw r||s signature, not the DER that node produces by default.
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: keys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`;
}
