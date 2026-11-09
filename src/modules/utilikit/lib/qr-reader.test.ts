import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { decodeQr, parseQrContent } from '@/modules/utilikit/lib/qr-reader';
import { formatWiFiString } from '@/modules/utilikit/lib/qr-generator';

function render(text: string, { scale = 4, margin = 4, invert = false } = {}) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = (modules.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - margin;
      const col = Math.floor(x / scale) - margin;
      const inside = row >= 0 && col >= 0 && row < modules.size && col < modules.size;
      const dark = inside && Boolean(modules.get(row, col)) !== invert;
      const shade = (inside ? dark : invert) ? 0 : 255;
      data.set([shade, shade, shade, 255], (y * size + x) * 4);
    }
  }

  return { data, size };
}

describe('decodeQr', () => {
  it('reads a generated code', () => {
    const { data, size } = render('https://example.com/path?q=1');
    expect(decodeQr(data, size, size)).toBe('https://example.com/path?q=1');
  });

  it('reads UTF-8 text', () => {
    const { data, size } = render('Canción de otoño 🎵');
    expect(decodeQr(data, size, size)).toBe('Canción de otoño 🎵');
  });

  it('reads light-on-dark codes', () => {
    const { data, size } = render('inverted', { invert: true });
    expect(decodeQr(data, size, size)).toBe('inverted');
  });

  it('returns null when there is no code', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    expect(decodeQr(data, 64, 64)).toBeNull();
  });
});

describe('parseQrContent', () => {
  it('recognizes links', () => {
    expect(parseQrContent('https://example.com/a b')).toEqual({ kind: 'url', url: 'https://example.com/a%20b' });
  });

  it('reads Wi-Fi networks, including escaped characters', () => {
    const text = formatWiFiString({ ssid: 'Casa;Pérez', password: 'p\\a:ss,"', encryption: 'WPA' });
    expect(parseQrContent(text)).toEqual({ kind: 'wifi', ssid: 'Casa;Pérez', password: 'p\\a:ss,"', security: 'WPA', hidden: false });
    expect(parseQrContent('WIFI:S:Open;T:nopass;H:true;;')).toEqual({ kind: 'wifi', ssid: 'Open', password: '', security: 'nopass', hidden: true });
  });

  it('reads email in both formats', () => {
    expect(parseQrContent('mailto:ana@example.com?subject=Hola%20Ana&body=Qu%C3%A9%20tal')).toEqual({
      kind: 'email',
      address: 'ana@example.com',
      subject: 'Hola Ana',
      body: 'Qué tal',
    });
    expect(parseQrContent('MATMSG:TO:bob@example.com;SUB:Hi;BODY:See you;;')).toEqual({
      kind: 'email',
      address: 'bob@example.com',
      subject: 'Hi',
      body: 'See you',
    });
  });

  it('reads phone numbers and text messages', () => {
    expect(parseQrContent('tel:+34600111222')).toEqual({ kind: 'phone', number: '+34600111222' });
    expect(parseQrContent('sms:+34600111222?body=On%20my%20way')).toEqual({ kind: 'sms', number: '+34600111222', message: 'On my way' });
    expect(parseQrContent('SMSTO:+34600111222:Time: 5pm')).toEqual({ kind: 'sms', number: '+34600111222', message: 'Time: 5pm' });
  });

  it('reads locations', () => {
    expect(parseQrContent('geo:40.4168,-3.7038')).toEqual({ kind: 'geo', latitude: 40.4168, longitude: -3.7038 });
  });

  it('treats anything else as text', () => {
    expect(parseQrContent('Just some words')).toEqual({ kind: 'text', text: 'Just some words' });
    expect(parseQrContent('javascript:alert(1)')).toEqual({ kind: 'text', text: 'javascript:alert(1)' });
  });
});
