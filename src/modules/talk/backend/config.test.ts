import { describe, expect, it } from 'vitest';

import { ConfigError, hostnameOf, iceServersFor, loadConfig, parseIceServers, parseStunPort, pushContact } from './config';

describe('the STUN port', () => {
  it('is 3478 unless set, and a real port when it is', () => {
    expect(parseStunPort(undefined)).toBe(3478);
    expect(parseStunPort(' ')).toBe(3478);
    expect(parseStunPort('3479')).toBe(3479);
    expect(parseStunPort('0')).toBe(0);
    for (const bad of ['70000', '-1', 'udp', '34.5']) expect(() => parseStunPort(bad)).toThrow(ConfigError);
  });
});

describe('VOIDKOI_ICE_SERVERS', () => {
  it('is left out unless set', () => {
    expect(parseIceServers(undefined)).toBeNull();
    expect(parseIceServers('')).toBeNull();
  });

  it('takes the shape RTCPeerConnection takes', () => {
    expect(parseIceServers('[{"urls":"stun:stun.example.com:3478"},{"urls":["turn:t.example.com"],"username":"u","credential":"p"}]')).toEqual([
      { urls: 'stun:stun.example.com:3478' },
      { urls: ['turn:t.example.com'], username: 'u', credential: 'p' },
    ]);
  });

  it('refuses anything that would confuse a browser', () => {
    for (const bad of ['not json', '{"urls":"stun:x"}', '[1]', '[{"urls":[]}]', '[{"urls":5}]', '[{"urls":"stun:x","username":1}]']) {
      expect(() => parseIceServers(bad), bad).toThrow(ConfigError);
    }
  });
});

describe('the ICE servers a browser gets', () => {
  it('are Talk’s own STUN server, under the name the browser reached the server at', () => {
    const config = { iceServers: null, stunPort: 3478 };
    expect(iceServersFor(config, 'chat.example.com')).toEqual([{ urls: 'stun:chat.example.com:3478' }]);
    expect(iceServersFor(config, '192.168.1.5:3000')).toEqual([{ urls: 'stun:192.168.1.5:3478' }]);
    expect(iceServersFor(config, '[::1]:3000')).toEqual([{ urls: 'stun:[::1]:3478' }]);
    expect(iceServersFor(config, 'chat.example.com, proxy.local')).toEqual([{ urls: 'stun:chat.example.com:3478' }]);
  });

  it('are none without a name or a STUN server, and the configured ones when set', () => {
    expect(iceServersFor({ iceServers: null, stunPort: 3478 }, null)).toEqual([]);
    expect(iceServersFor({ iceServers: null, stunPort: 3478 }, 'bad host/../')).toEqual([]);
    expect(iceServersFor({ iceServers: null, stunPort: 0 }, 'chat.example.com')).toEqual([]);
    expect(iceServersFor({ iceServers: [{ urls: 'turn:t.example.com' }], stunPort: 3478 }, 'chat.example.com')).toEqual([{ urls: 'turn:t.example.com' }]);
    expect(hostnameOf('Example.com:443')).toBe('Example.com');
  });
});

describe('uploads', () => {
  it('are up to a gigabyte each, and ten in all for each account', () => {
    expect(loadConfig({})).toMatchObject({ maxUploadBytes: 1024 ** 3, uploadQuotaBytes: 10 * 1024 ** 3 });
  });
});

describe('the push contact', () => {
  it('is the server’s public address over HTTPS, and a mailto: otherwise', () => {
    expect(pushContact('https://chat.example.com/')).toBe('https://chat.example.com');
    expect(pushContact('http://localhost:3000')).toBe('mailto:talk@localhost');
    expect(pushContact(undefined)).toBe('mailto:talk@localhost');
    expect(loadConfig({ VOIDKOI_NEXTAUTH_URL: 'https://chat.example.com' })).toMatchObject({ stunPort: 3478, iceServers: null, pushContact: 'https://chat.example.com' });
  });
});
