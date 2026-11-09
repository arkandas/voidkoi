/**
 * A pretend browser for the push tests: it subscribes with its own keys and
 * decrypts what the server sends it, the way a real one does. And a push
 * service that keeps requests instead of sending them anywhere.
 */
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

import type { PushPayload, PushSubscriptionRequest } from '@/modules/talk/lib/protocol';

import type { PushRequest, PushTransport } from '../push/service';

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer => Buffer.from(hkdfSync('sha256', ikm, salt, info, length));

/** The receiving half of RFC 8291, as a browser runs it. */
export function decryptPushBody(body: Buffer, uaPrivateKey: Buffer, authSecret: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivateKey);
  const uaPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(asPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);

  // Trailing zero padding, then the delimiter: 2 marks the last record.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (padded[end] !== 2) throw new Error('missing last-record delimiter');
  return padded.subarray(0, end);
}

export class FakeDevice {
  readonly privateKey: Buffer;
  readonly authSecret: Buffer;
  readonly subscription: PushSubscriptionRequest;

  constructor(host = 'fcm.googleapis.com') {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    this.privateKey = ecdh.getPrivateKey();
    this.authSecret = randomBytes(16);
    this.subscription = {
      endpoint: `https://${host}/fcm/send/${randomBytes(12).toString('base64url')}`,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: this.authSecret.toString('base64url') },
    };
  }

  get endpoint(): string {
    return this.subscription.endpoint;
  }

  read(request: PushRequest): PushPayload {
    return JSON.parse(decryptPushBody(request.body, this.privateKey, this.authSecret).toString('utf8')) as PushPayload;
  }
}

/** A push service that keeps what it is asked to deliver. `status` answers every request. */
export class RecordingPushService {
  readonly requests: PushRequest[] = [];
  status = 201;
  private readonly waiters: Array<() => void> = [];

  readonly transport: PushTransport = async request => {
    this.requests.push(request);
    for (const wake of this.waiters.splice(0)) wake();
    return { status: this.status };
  };

  to(endpoint: string): PushRequest[] {
    return this.requests.filter(request => request.url === endpoint);
  }

  /** Wait until `count` requests have reached `endpoint`. */
  async waitFor(endpoint: string, count = 1, timeoutMs = 5000): Promise<PushRequest[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.to(endpoint).length < count) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`expected ${count} push(es) to ${endpoint}, got ${this.to(endpoint).length}`);
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return this.to(endpoint);
  }
}
