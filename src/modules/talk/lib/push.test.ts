import { describe, expect, it } from 'vitest';

import { base64UrlToBytes, notificationPath, pushSupport, sameKey, type PushEnvironment } from './push';

const desktop: PushEnvironment = {
  secure: true,
  serviceWorker: true,
  pushManager: true,
  notification: true,
  ios: false,
  standalone: false,
};

describe('pushSupport', () => {
  it('works in a desktop or Android browser', () => {
    expect(pushSupport(desktop)).toBe('supported');
  });

  it('needs HTTPS before anything else', () => {
    expect(pushSupport({ ...desktop, secure: false })).toBe('insecure');
    expect(pushSupport({ ...desktop, secure: false, ios: true })).toBe('insecure');
  });

  it('sends an iPhone in a Safari tab to the Home Screen, not away', () => {
    // Safari hides the APIs from a tab, which must not read as "unsupported".
    const safariTab = { ...desktop, ios: true, pushManager: false, notification: false };
    expect(pushSupport(safariTab)).toBe('needs-install');
  });

  it('works on an iPhone once Talk is on the Home Screen', () => {
    expect(pushSupport({ ...desktop, ios: true, standalone: true })).toBe('supported');
  });

  it('says so when the browser cannot do it at all', () => {
    expect(pushSupport({ ...desktop, pushManager: false })).toBe('unsupported');
    expect(pushSupport({ ...desktop, serviceWorker: false })).toBe('unsupported');
    expect(pushSupport({ ...desktop, notification: false })).toBe('unsupported');
  });
});

describe('base64UrlToBytes', () => {
  it('decodes the unpadded base64url a server key arrives as', () => {
    // The RFC 8291 example public key: 65 bytes, starting 0x04.
    const bytes = base64UrlToBytes(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    );
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
    expect(bytes[64]).toBe(0x0f);
  });

  it('handles the characters base64url changes', () => {
    expect([...base64UrlToBytes('-_8')]).toEqual([0xfb, 0xff]);
  });
});

describe('sameKey', () => {
  const key = new Uint8Array([4, 1, 2, 3]);

  it('matches the same bytes', () => {
    expect(sameKey(new Uint8Array([4, 1, 2, 3]).buffer, key)).toBe(true);
  });

  it('does not match a different key, or none', () => {
    expect(sameKey(new Uint8Array([4, 1, 2, 9]).buffer, key)).toBe(false);
    expect(sameKey(new Uint8Array([4, 1, 2]).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});

describe('notificationPath', () => {
  const origin = 'https://suite.example';

  it('follows the full URL the service worker names, as a path on this site', () => {
    expect(notificationPath('https://suite.example/talk?conversation=12', origin)).toBe('/talk?conversation=12');
    expect(notificationPath('https://suite.example/talk/calls', origin)).toBe('/talk/calls');
    expect(notificationPath('/talk?with=3', origin)).toBe('/talk?with=3');
  });

  it('goes nowhere else', () => {
    expect(notificationPath('https://elsewhere.example/talk', origin)).toBeNull();
    expect(notificationPath('//elsewhere.example/talk', origin)).toBeNull();
    expect(notificationPath('http://suite.example/talk', origin)).toBeNull();
    expect(notificationPath('javascript:alert(1)', origin)).toBeNull();
  });
});
