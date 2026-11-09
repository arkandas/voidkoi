import { createECDH, createPublicKey, verify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptPushBody, FakeDevice } from '../test/push-device';
import { encryptPayload, MAX_PLAINTEXT_BYTES, PushKeyError } from './encryption';
import { isAllowedPushEndpoint } from './endpoints';
import { messageNotification, missedCallNotification, notificationLocale, ringingNotification, testNotification } from './notifications';
import { generateVapidKeys, loadVapidKeys, vapidAuthorization } from './vapid';

/** RFC 8291, section 5 and appendix A: every input, and the exact output. */
const RFC_8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInm' +
    'YWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgS' +
    'xsj_Qulcy4a-fN',
};

describe('push message encryption', () => {
  it('reproduces the worked example of RFC 8291 byte for byte', () => {
    const body = encryptPayload(
      Buffer.from(RFC_8291.plaintext),
      { p256dh: RFC_8291.uaPublic, auth: RFC_8291.authSecret },
      { salt: Buffer.from(RFC_8291.salt, 'base64url'), serverPrivateKey: Buffer.from(RFC_8291.asPrivate, 'base64url') },
    );
    expect(body.toString('base64url')).toBe(RFC_8291.body);
  });

  it('decrypts the RFC example with the receiver’s key, as a browser would', () => {
    const plaintext = decryptPushBody(
      Buffer.from(RFC_8291.body, 'base64url'),
      Buffer.from(RFC_8291.uaPrivate, 'base64url'),
      Buffer.from(RFC_8291.authSecret, 'base64url'),
    );
    expect(plaintext.toString()).toBe(RFC_8291.plaintext);
  });

  it('round-trips to a freshly subscribed device, with a new key and salt every time', () => {
    const device = new FakeDevice();
    const message = JSON.stringify({ title: 'Ada Lovelace', body: 'Tea at four? 🫖' });
    const first = encryptPayload(Buffer.from(message), device.subscription.keys);
    const second = encryptPayload(Buffer.from(message), device.subscription.keys);
    expect(decryptPushBody(first, device.privateKey, device.authSecret).toString()).toBe(message);
    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false);
    expect(first.subarray(21, 86).equals(second.subarray(21, 86))).toBe(false);
  });

  it('refuses keys a browser doesn’t send, and a message too big for a push service', () => {
    const { keys } = new FakeDevice().subscription;
    const compressed = createECDH('prime256v1');
    compressed.generateKeys();
    for (const bad of [
      { ...keys, p256dh: compressed.getPublicKey(null, 'compressed').toString('base64url') },
      { ...keys, p256dh: 'not-a-key' },
      { ...keys, auth: Buffer.alloc(8).toString('base64url') },
    ]) {
      expect(() => encryptPayload(Buffer.from('x'), bad)).toThrow(PushKeyError);
    }
    expect(encryptPayload(Buffer.alloc(MAX_PLAINTEXT_BYTES), keys).length).toBe(4096);
    expect(() => encryptPayload(Buffer.alloc(MAX_PLAINTEXT_BYTES + 1), keys)).toThrow(PushKeyError);
  });
});

describe('VAPID', () => {
  const keys = loadVapidKeys(generateVapidKeys());
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';

  it('signs a token only the push service it names accepts', () => {
    const now = Date.UTC(2026, 8, 24, 12);
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(vapidAuthorization(endpoint, keys, 'mailto:ops@example.com', now))!;
    const [header, claims, signature] = match[1]!.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString()) as Record<string, unknown>;
    expect(body).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:ops@example.com', exp: now / 1000 + 12 * 3600 });

    expect(match[2]).toBe(keys.publicKey);
    const point = Buffer.from(match[2]!, 'base64url');
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
      format: 'jwk',
    });
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('stores and reloads a pair unchanged, and refuses halves that don’t match', () => {
    const stored = generateVapidKeys();
    expect(Buffer.from(stored.public_key, 'base64url')).toHaveLength(65);
    expect(loadVapidKeys(stored).publicKey).toBe(stored.public_key);
    expect(() => loadVapidKeys({ public_key: stored.public_key, private_key: generateVapidKeys().private_key })).toThrow();
  });
});

describe('where notifications go', () => {
  it('is only the push services browsers use', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost:8080/api/users',
      'https://evil.example.com/push',
      'https://fcm.googleapis.com.evil.example.com/push',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'not a url',
    ]) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
    for (const host of ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com', 'wns2-par02p.notify.windows.com']) {
      expect(isAllowedPushEndpoint(`https://${host}/send/abc`), host).toBe(true);
    }
  });
});

describe('what a notification says', () => {
  const at = new Date('2026-10-22T10:00:00Z');

  it('is written in the account’s language, English when it has none', () => {
    expect(notificationLocale('es')).toBe('es');
    expect(notificationLocale(null)).toBe('en');
    expect(notificationLocale('fr')).toBe('en');
    expect(ringingNotification({ callId: 1, callerName: 'Ada', media: 'video', ringSeconds: 30 }, 'es').payload.body).toBe('Videollamada entrante');
    expect(missedCallNotification({ callId: 1, callerName: 'Ada', media: 'audio' }, 'es').payload).toMatchObject({ body: 'Llamada perdida', url: '/talk/calls' });
    expect(testNotification('es').payload.body).toBe('Las notificaciones funcionan en este dispositivo.');
  });

  it('opens the chat with the sender, or the group, and shortens a long message', () => {
    const direct = messageNotification({ conversationId: 7, senderId: 3, senderName: 'Ada', text: `${'word '.repeat(100)}end`, unread: 2, at }, 'en');
    expect(direct.payload).toMatchObject({ title: 'Ada', url: '/talk?with=3', tag: 'conversation-7', badge: 2 });
    expect([...direct.payload.body]).toHaveLength(180);
    expect(direct.payload.body.endsWith('…')).toBe(true);

    const group = messageNotification({ conversationId: 7, senderId: 3, senderName: 'Ada', groupName: 'Familia', text: '', attachment: { name: 'menu.pdf', isImage: false }, unread: 1, at }, 'en');
    expect(group.payload).toMatchObject({ title: 'Familia', body: 'Ada: 📎 menu.pdf', url: '/talk?conversation=7' });
  });
});
