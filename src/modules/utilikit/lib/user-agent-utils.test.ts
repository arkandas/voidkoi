import { describe, expect, it } from 'vitest';
import { parseUserAgent, USER_AGENT_EXAMPLES } from '@/modules/utilikit/lib/user-agent-utils';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  chromeAndroidReduced:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebotSmartphone:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.216 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  firefoxAndroidTablet: 'Mozilla/5.0 (Android 13; Tablet; rv:121.0) Gecko/121.0 Firefox/121.0',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko',
};

const nothing = { name: null, version: null };

describe('parseUserAgent', () => {
  it('parses Chrome on Windows', () => {
    expect(parseUserAgent(UA.chromeWindows)).toEqual({
      browser: { name: 'Google Chrome', version: '120.0.0.0' },
      os: { name: 'Windows', version: '10' },
      engine: { name: 'Blink', version: '120.0.0.0' },
      device: { type: 'desktop', vendor: null, model: null },
    });
  });

  it('parses Safari on macOS', () => {
    expect(parseUserAgent(UA.safariMac)).toEqual({
      browser: { name: 'Safari', version: '17.1' },
      os: { name: 'macOS', version: '10.15.7' },
      engine: { name: 'WebKit', version: '605.1.15' },
      device: { type: 'desktop', vendor: 'Apple', model: 'Macintosh' },
    });
  });

  it('parses Safari on iPhone as iOS, not macOS', () => {
    expect(parseUserAgent(UA.safariIphone)).toEqual({
      browser: { name: 'Safari', version: '17.1' },
      os: { name: 'iOS', version: '17.1.1' },
      engine: { name: 'WebKit', version: '605.1.15' },
      device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
    });
  });

  it('parses Firefox on Linux', () => {
    expect(parseUserAgent(UA.firefoxLinux)).toEqual({
      browser: { name: 'Mozilla Firefox', version: '121.0' },
      os: { name: 'Linux', version: null },
      engine: { name: 'Gecko', version: '121.0' },
      device: { type: 'desktop', vendor: null, model: null },
    });
  });

  it('parses Edge even though its string also mentions Chrome and Safari', () => {
    const info = parseUserAgent(UA.edge);
    expect(info.browser).toEqual({ name: 'Microsoft Edge', version: '120.0.2210.91' });
    expect(info.os).toEqual({ name: 'Windows', version: '10' });
    expect(info.engine.name).toBe('Blink');
  });

  it('parses Chrome on an Android phone with its model and vendor', () => {
    expect(parseUserAgent(UA.chromeAndroid)).toEqual({
      browser: { name: 'Google Chrome', version: '120.0.6099.144' },
      os: { name: 'Android', version: '13' },
      engine: { name: 'Blink', version: '120.0.6099.144' },
      device: { type: 'mobile', vendor: 'Samsung', model: 'SM-S918B' },
    });
  });

  it('ignores the placeholder model in reduced Android user agents', () => {
    expect(parseUserAgent(UA.chromeAndroidReduced).device).toEqual({ type: 'mobile', vendor: null, model: null });
  });

  it('recognises Googlebot as a bot', () => {
    expect(parseUserAgent(UA.googlebot)).toEqual({
      browser: { name: 'Googlebot', version: '2.1' },
      os: nothing,
      engine: nothing,
      device: { type: 'bot', vendor: null, model: null },
    });
  });

  it('recognises the smartphone Googlebot as a bot rather than Chrome', () => {
    const info = parseUserAgent(UA.googlebotSmartphone);
    expect(info.browser).toEqual({ name: 'Googlebot', version: '2.1' });
    expect(info.device.type).toBe('bot');
    expect(info.os).toEqual({ name: 'Android', version: '6.0.1' });
  });

  it('tells Chromium-based browsers apart from Chrome', () => {
    expect(parseUserAgent(UA.opera).browser).toEqual({ name: 'Opera', version: '106.0.0.0' });
  });

  it('parses Chrome on iOS, which runs on WebKit', () => {
    expect(parseUserAgent(UA.chromeIos)).toEqual({
      browser: { name: 'Google Chrome', version: '120.0.6099.119' },
      os: { name: 'iOS', version: '17.2' },
      engine: { name: 'WebKit', version: '605.1.15' },
      device: { type: 'mobile', vendor: 'Apple', model: 'iPhone' },
    });
  });

  it('detects tablets', () => {
    expect(parseUserAgent(UA.safariIpad).device).toEqual({ type: 'tablet', vendor: 'Apple', model: 'iPad' });
    expect(parseUserAgent(UA.safariIpad).os).toEqual({ name: 'iOS', version: '16.6' });
    expect(parseUserAgent(UA.firefoxAndroidTablet).device).toEqual({ type: 'tablet', vendor: null, model: null });
  });

  it('parses Internet Explorer 11', () => {
    expect(parseUserAgent(UA.ie11)).toEqual({
      browser: { name: 'Internet Explorer', version: '11.0' },
      os: { name: 'Windows', version: '7' },
      engine: { name: 'Trident', version: '7.0' },
      device: { type: 'desktop', vendor: null, model: null },
    });
  });

  it('returns nothing but an unknown device for empty or unrecognisable input', () => {
    const unknown = { browser: nothing, os: nothing, engine: nothing, device: { type: 'unknown', vendor: null, model: null } };
    for (const value of ['', '   ', 'not a user agent', '🙂🙂🙂', 'curl/8.4.0']) {
      expect(parseUserAgent(value)).toEqual(unknown);
    }
  });

  it('recognises the browser and device of every bundled example', () => {
    for (const { ua } of USER_AGENT_EXAMPLES) {
      const info = parseUserAgent(ua);
      expect(info.browser.name).not.toBeNull();
      expect(info.device.type).not.toBe('unknown');
    }
  });
});
