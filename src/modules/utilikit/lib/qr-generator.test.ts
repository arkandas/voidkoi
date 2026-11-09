import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import {
  buildQRContent,
  centerLogoBox,
  createQRMatrix,
  dataUrlToBlob,
  decodeDataUrl,
  DEFAULT_QR_OPTIONS,
  EMPTY_QR_FIELDS,
  fitInBox,
  formatEmailString,
  formatPhoneString,
  formatSMSString,
  formatWiFiString,
  generatePCBQRSvg,
  generateQR,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  layoutPcbModules,
  modulesPath,
  normalizePhone,
  normalizeUrl,
  parseViewBox,
  PcbLayout,
  QR_TYPES,
  QRFields,
  QRMatrix,
  renderPcbSvg,
  roundedRectPath,
} from '@/modules/utilikit/lib/qr-generator';

const fields = (overrides: Partial<QRFields>): QRFields => ({ ...EMPTY_QR_FIELDS, ...overrides });

const matrixFrom = (rows: string[]): QRMatrix => ({
  size: rows.length,
  get: (row, col) => rows[row][col] === '#',
});

const darkCount = (text: string, level: 'L' | 'M' | 'Q' | 'H') =>
  QRCode.create(text, { errorCorrectionLevel: level }).modules.data.reduce((sum, bit) => sum + bit, 0);

const countMoves = (path: string) => (path.match(/M/g) ?? []).length;

function parseWiFi(payload: string): Record<string, string> {
  expect(payload.startsWith('WIFI:')).toBe(true);
  expect(payload.endsWith(';;')).toBe(true);

  const body = payload.slice('WIFI:'.length, -1);
  const entries: Record<string, string> = {};
  let key = '';
  let value = '';
  let readingKey = true;

  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (readingKey) {
      if (char === ':') readingKey = false;
      else key += char;
    } else if (char === '\\') {
      value += body[++index];
    } else if (char === ';') {
      entries[key] = value;
      key = '';
      value = '';
      readingKey = true;
    } else {
      value += char;
    }
  }

  return entries;
}

function hasFinderPattern(matrix: QRMatrix, top: number, left: number): boolean {
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const ring = Math.max(Math.abs(row - 3), Math.abs(col - 3));
      if (Boolean(matrix.get(top + row, left + col)) !== (ring !== 2)) return false;
    }
  }
  return true;
}

describe('normalizeUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('www.example.com/path?q=1')).toBe('https://www.example.com/path?q=1');
  });

  it('treats host:port as a host, not a scheme', () => {
    expect(normalizeUrl('localhost:3000/app')).toBe('https://localhost:3000/app');
    expect(normalizeUrl('example.com:8080')).toBe('https://example.com:8080');
  });

  it('keeps existing schemes and trims whitespace', () => {
    expect(normalizeUrl('  https://example.com/a?b=c  ')).toBe('https://example.com/a?b=c');
    expect(normalizeUrl('HTTP://Example.com')).toBe('HTTP://Example.com');
    expect(normalizeUrl('ftp://files.example.com')).toBe('ftp://files.example.com');
    expect(normalizeUrl('mailto:ana@example.com')).toBe('mailto:ana@example.com');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('validators', () => {
  it('accepts only URLs the WHATWG parser accepts', () => {
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('https://exa mple.com')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false);
  });

  it('checks the basic shape of an email address', () => {
    expect(isValidEmail('ana@example.com')).toBe(true);
    expect(isValidEmail('  ana@example.com ')).toBe(true);
    expect(isValidEmail('ana@example')).toBe(false);
    expect(isValidEmail('ana maria@example.com')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('accepts short and international numbers with visual separators', () => {
    expect(isValidPhone('+34 600 11 22 33')).toBe(true);
    expect(isValidPhone('(555) 123-4567')).toBe(true);
    expect(isValidPhone('112')).toBe(true);
    expect(isValidPhone('612345678')).toBe(true);
  });

  it('rejects numbers that are too short, too long or contain letters', () => {
    expect(isValidPhone('12')).toBe(false);
    expect(isValidPhone('+1234567890123456')).toBe(false);
    expect(isValidPhone('600-ABC-123')).toBe(false);
    expect(isValidPhone('+34+600112233')).toBe(false);
  });
});

describe('formatWiFiString', () => {
  it('builds the WIFI: URI', () => {
    expect(formatWiFiString({ ssid: 'Home', password: 'secret', encryption: 'WPA' })).toBe(
      'WIFI:T:WPA;S:Home;P:secret;;'
    );
  });

  it('escapes ; , : \\ and " with a backslash', () => {
    expect(formatWiFiString({ ssid: 'a;b,c:d\\e"f', password: 'p;w', encryption: 'WEP' })).toBe(
      String.raw`WIFI:T:WEP;S:a\;b\,c\:d\\e\"f;P:p\;w;;`
    );
  });

  it('round-trips awkward values through an independent parser', () => {
    for (const value of ['Café ☕', 'semi;colon;', 'back\\slash\\', '"quoted"', 'a:b,c', 'plain']) {
      const parsed = parseWiFi(formatWiFiString({ ssid: value, password: value, encryption: 'WPA' }));
      expect(parsed).toEqual({ T: 'WPA', S: value, P: value });
    }
  });

  it('leaves out the password for open networks', () => {
    expect(formatWiFiString({ ssid: 'Cafe', password: 'leftover', encryption: 'nopass' })).toBe(
      'WIFI:T:nopass;S:Cafe;;'
    );
  });
});

describe('formatEmailString', () => {
  it('returns a bare mailto: URI without subject or body', () => {
    expect(formatEmailString('ana@example.com')).toBe('mailto:ana@example.com');
    expect(formatEmailString(' ana@example.com ', '  ', '')).toBe('mailto:ana@example.com');
  });

  it('percent-encodes subject and body so a URL parser recovers them exactly', () => {
    const subject = 'Q&A = 50% off + more #1?';
    const body = 'Hola, ¿qué tal? 👋 a/b';
    const uri = formatEmailString('ana@example.com', subject, body);
    const parsed = new URL(uri);

    expect(uri).not.toMatch(/[ +#]/);
    expect(parsed.protocol).toBe('mailto:');
    expect(parsed.pathname).toBe('ana@example.com');
    expect(parsed.searchParams.get('subject')).toBe(subject);
    expect(parsed.searchParams.get('body')).toBe(body);
  });

  it('keeps the subject before the body', () => {
    expect(formatEmailString('a@b.co', 'Hi there', 'Body')).toBe('mailto:a@b.co?subject=Hi%20there&body=Body');
  });
});

describe('formatSMSString and formatPhoneString', () => {
  it('strips visual separators from the number', () => {
    expect(normalizePhone(' +1 (555) 123.45-67 ')).toBe('+15551234567');
    expect(formatPhoneString('(555) 123-4567')).toBe('tel:5551234567');
    expect(formatSMSString('+34 600 11-22-33')).toBe('sms:+34600112233');
  });

  it('adds an encoded body to sms: URIs', () => {
    const message = 'Hola & adiós + 100%';
    const uri = formatSMSString('+34 600 112 233', message);
    const parsed = new URL(uri);

    expect(parsed.protocol).toBe('sms:');
    expect(parsed.pathname).toBe('+34600112233');
    expect(parsed.searchParams.get('body')).toBe(message);
  });

  it('omits a blank message', () => {
    expect(formatSMSString('112', '   ')).toBe('sms:112');
  });
});

describe('buildQRContent', () => {
  it('reports missing input for every type', () => {
    for (const type of QR_TYPES) {
      expect(buildQRContent(type, EMPTY_QR_FIELDS)).toEqual({ valid: false, error: 'required' });
    }
  });

  it('normalises and validates URLs', () => {
    expect(buildQRContent('url', fields({ url: ' example.com/path ' }))).toEqual({
      valid: true,
      content: 'https://example.com/path',
    });
    expect(buildQRContent('url', fields({ url: 'exa mple.com' }))).toEqual({ valid: false, error: 'invalidUrl' });
  });

  it('keeps plain text as typed but rejects whitespace only', () => {
    expect(buildQRContent('text', fields({ text: '  hello  ' }))).toEqual({ valid: true, content: '  hello  ' });
    expect(buildQRContent('text', fields({ text: ' \n ' }))).toEqual({ valid: false, error: 'required' });
  });

  it('requires a password for secured Wi-Fi and ignores a hidden one for open networks', () => {
    expect(buildQRContent('wifi', fields({ ssid: 'Home', security: 'WPA' }))).toEqual({
      valid: false,
      error: 'required',
    });
    expect(buildQRContent('wifi', fields({ ssid: 'Cafe', password: 'secret', security: 'nopass' }))).toEqual({
      valid: true,
      content: 'WIFI:T:nopass;S:Cafe;;',
    });
    expect(buildQRContent('wifi', fields({ ssid: 'Home', password: 'secret', security: 'WPA' }))).toEqual({
      valid: true,
      content: 'WIFI:T:WPA;S:Home;P:secret;;',
    });
  });

  it('validates email addresses', () => {
    expect(buildQRContent('email', fields({ email: 'nope' }))).toEqual({ valid: false, error: 'invalidEmail' });
    expect(buildQRContent('email', fields({ email: 'ana@example.com', subject: 'Hi' }))).toEqual({
      valid: true,
      content: 'mailto:ana@example.com?subject=Hi',
    });
  });

  it('validates phone numbers and only adds the message to SMS', () => {
    const input = fields({ phone: '+34 600 112 233', message: 'Hola' });
    expect(buildQRContent('sms', input)).toEqual({ valid: true, content: 'sms:+34600112233?body=Hola' });
    expect(buildQRContent('phone', input)).toEqual({ valid: true, content: 'tel:+34600112233' });
    expect(buildQRContent('phone', fields({ phone: 'call me' }))).toEqual({ valid: false, error: 'invalidPhone' });
    expect(buildQRContent('sms', fields({ phone: ' ( ) ' }))).toEqual({ valid: false, error: 'required' });
  });
});

describe('createQRMatrix', () => {
  it('uses 4 × version + 17 modules per side', () => {
    expect(createQRMatrix('HELLO WORLD', 'Q').size).toBe(21);
    expect(createQRMatrix('HELLO WORLD', 'H').size).toBe(25);
    expect(createQRMatrix('https://example.com', 'L').size).toBe(25);
    expect(createQRMatrix('https://example.com', 'H').size).toBe(29);

    const text = 'x'.repeat(300);
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
      const { version } = QRCode.create(text, { errorCorrectionLevel: level });
      expect(createQRMatrix(text, level).size).toBe(4 * version + 17);
    }
  });

  it('places the three finder patterns and the fixed dark module', () => {
    const matrix = createQRMatrix('https://example.com', 'M');
    const { version } = QRCode.create('https://example.com', { errorCorrectionLevel: 'M' });
    const last = matrix.size - 7;

    expect(hasFinderPattern(matrix, 0, 0)).toBe(true);
    expect(hasFinderPattern(matrix, 0, last)).toBe(true);
    expect(hasFinderPattern(matrix, last, 0)).toBe(true);
    expect(hasFinderPattern(matrix, last, last)).toBe(false);
    expect(Boolean(matrix.get(4 * version + 9, 8))).toBe(true);
  });

  it('is deterministic', () => {
    const first = createQRMatrix('determinism', 'M');
    const second = createQRMatrix('determinism', 'M');
    for (let row = 0; row < first.size; row++) {
      for (let col = 0; col < first.size; col++) {
        expect(second.get(row, col)).toBe(first.get(row, col));
      }
    }
  });
});

describe('layoutPcbModules', () => {
  const sample = matrixFrom(['##.', '.#.', '..#']);

  it('places dark modules on a grid offset by the margin', () => {
    const layout = layoutPcbModules(sample, 10, { margin: 1 });

    expect(layout.size).toBe(50);
    expect(layout.radius).toBeCloseTo(3.5);
    expect(layout.logo).toBeNull();
    expect(layout.modules.map(({ x, y }) => [x, y])).toEqual([
      [10, 10],
      [20, 10],
      [20, 20],
      [30, 30],
    ]);
  });

  it('rounds a corner only where both adjacent sides are empty', () => {
    const [first, second, middle, isolated] = layoutPcbModules(sample, 10).modules.map(module => module.corners);

    expect(first).toEqual({ topLeft: true, topRight: false, bottomRight: false, bottomLeft: true });
    expect(second).toEqual({ topLeft: false, topRight: true, bottomRight: false, bottomLeft: false });
    expect(middle).toEqual({ topLeft: false, topRight: false, bottomRight: true, bottomLeft: true });
    expect(isolated).toEqual({ topLeft: true, topRight: true, bottomRight: true, bottomLeft: true });
  });

  it('supports a zero margin', () => {
    const layout = layoutPcbModules(sample, 4, { margin: 0 });
    expect(layout.size).toBe(12);
    expect(layout.modules[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('draws one module per dark cell of a real code, inside the quiet zone', () => {
    const matrix = createQRMatrix('https://example.com', 'H');
    const layout = layoutPcbModules(matrix, 10);

    expect(layout.size).toBe((matrix.size + 4) * 10);
    expect(layout.modules).toHaveLength(darkCount('https://example.com', 'H'));
    for (const { x, y } of layout.modules) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(x + 10).toBeLessThanOrEqual(layout.size - 20);
      expect(y + 10).toBeLessThanOrEqual(layout.size - 20);
    }
  });

  it('clears a centred square for the logo', () => {
    const matrix = createQRMatrix('https://example.com/some/longer/path', 'H');
    const plain = layoutPcbModules(matrix, 10);
    const layout = layoutPcbModules(matrix, 10, { withLogo: true, logoSizePercent: 22 });
    const logo = layout.logo;

    expect(logo).not.toBeNull();
    if (!logo) return;
    expect(logo.size).toBe(Math.floor(matrix.size * 10 * 0.22));
    expect(logo.x + logo.size / 2).toBeCloseTo(layout.size / 2);
    expect(logo.y).toBe(logo.x);
    expect(layout.modules.length).toBeLessThan(plain.modules.length);

    for (const { x, y } of layout.modules) {
      const overlaps = x < logo.x + logo.size && x + 10 > logo.x && y < logo.y + logo.size && y + 10 > logo.y;
      expect(overlaps).toBe(false);
    }
  });

  it('rounds modules that border the cleared logo area', () => {
    const line = matrixFrom(['..#..', '..#..', '..#..', '..#..', '..#..']);
    const layout = layoutPcbModules(line, 10, { margin: 0, withLogo: true, logoSizePercent: 20 });

    expect(layout.modules.map(({ y }) => y)).toEqual([0, 10, 30, 40]);
    expect(layout.modules[1].corners).toMatchObject({ bottomLeft: true, bottomRight: true });
    expect(layout.modules[2].corners).toMatchObject({ topLeft: true, topRight: true });
  });
});

describe('roundedRectPath', () => {
  const none = { topLeft: false, topRight: false, bottomRight: false, bottomLeft: false };
  const all = { topLeft: true, topRight: true, bottomRight: true, bottomLeft: true };

  it('draws a plain square clockwise', () => {
    expect(roundedRectPath(0, 0, 10, 10, 2, none)).toBe('M0,0 L10,0 L10,10 L0,10 L0,0 Z');
  });

  it('replaces each rounded corner with a quadratic curve controlled by the corner point', () => {
    expect(roundedRectPath(20, 30, 10, 10, 2, all)).toBe(
      'M22,30 L28,30 Q30,30 30,32 L30,38 Q30,40 28,40 L22,40 Q20,40 20,38 L20,32 Q20,30 22,30 Z'
    );
  });

  it('stays inside its bounding box for every corner combination', () => {
    for (let mask = 0; mask < 16; mask++) {
      const corners = {
        topLeft: Boolean(mask & 1),
        topRight: Boolean(mask & 2),
        bottomRight: Boolean(mask & 4),
        bottomLeft: Boolean(mask & 8),
      };
      const numbers = (roundedRectPath(5, 7, 20, 10, 3, corners).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

      expect(numbers.length % 2).toBe(0);
      numbers.forEach((value, index) => {
        const [min, max] = index % 2 === 0 ? [5, 25] : [7, 17];
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      });
    }
  });

  it('joins one subpath per module', () => {
    const layout = layoutPcbModules(createQRMatrix('HELLO WORLD', 'Q'), 10);
    expect(countMoves(modulesPath(layout))).toBe(layout.modules.length);
  });
});

describe('fitInBox', () => {
  const box = { x: 10, y: 10, size: 40 };

  it('fits wide and tall images without distortion, centred', () => {
    expect(fitInBox(200, 100, box)).toEqual({ x: 10, y: 20, width: 40, height: 20 });
    expect(fitInBox(50, 100, box)).toEqual({ x: 20, y: 10, width: 20, height: 40 });
    expect(fitInBox(8, 8, box)).toEqual({ x: 10, y: 10, width: 40, height: 40 });
  });

  it('fills the box when the image has no intrinsic size', () => {
    expect(fitInBox(0, 0, box)).toEqual({ x: 10, y: 10, width: 40, height: 40 });
  });
});

describe('centerLogoBox', () => {
  it('centres a box sized by percentage of the image', () => {
    expect(centerLogoBox(400, 20)).toEqual({ x: 160, y: 160, size: 80 });
    expect(centerLogoBox(400, 10)).toEqual({ x: 180, y: 180, size: 40 });
  });

  it('defaults to the standard logo size', () => {
    expect(centerLogoBox(400)).toEqual(centerLogoBox(400, DEFAULT_QR_OPTIONS.logoSizePercent));
  });

  it('never covers more of the code than high error correction tolerates', () => {
    expect(centerLogoBox(400, 90).size).toBe(120);
    expect(centerLogoBox(400, -5)).toEqual({ x: 200, y: 200, size: 0 });
  });

  it('keeps the logo inside the code', () => {
    const box = centerLogoBox(333, 20);
    expect(box.x).toBeGreaterThan(0);
    expect(box.x + box.size).toBeLessThan(333);
    expect(box.x).toBeCloseTo((333 - box.size) / 2);
  });
});

describe('parseViewBox', () => {
  it('reads space- or comma-separated values', () => {
    expect(parseViewBox('0 0 24 24')).toEqual({ x: 0, y: 0, width: 24, height: 24 });
    expect(parseViewBox(' -5,-5, 10  10 ')).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });

  it('falls back to width and height, then to 100 × 100', () => {
    expect(parseViewBox(null, '48px', '32')).toEqual({ x: 0, y: 0, width: 48, height: 32 });
    expect(parseViewBox(null)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('rejects malformed or empty boxes', () => {
    expect(parseViewBox('0 0 24')).toBeNull();
    expect(parseViewBox('a b c d')).toBeNull();
    expect(parseViewBox('0 0 0 10')).toBeNull();
  });
});

describe('PCB SVG export', () => {
  it('sizes the canvas from the module count and draws every dark module', () => {
    const svg = generatePCBQRSvg('HELLO WORLD', { errorCorrectionLevel: 'Q' });
    const path = svg.match(/ d="([^"]*)"/)?.[1] ?? '';

    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('viewBox="0 0 250 250" width="250" height="250"');
    expect(countMoves(path)).toBe(darkCount('HELLO WORLD', 'Q'));
    expect(svg).not.toContain('<rect');
  });

  it('keeps a hole but embeds nothing for raster logos', () => {
    const text = 'https://example.com/some/longer/path';
    const plain = generatePCBQRSvg(text);
    const withLogo = generatePCBQRSvg(text, { logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' });

    expect(countMoves(withLogo)).toBeLessThan(countMoves(plain));
    expect(withLogo).not.toContain('<g');
  });

  it('scales and centres an SVG logo inside the logo box', () => {
    const layout: PcbLayout = { size: 140, moduleSize: 10, radius: 3.5, modules: [], logo: { x: 50, y: 50, size: 40 } };
    const svg = renderPcbSvg(layout, { content: '<circle r="5"/>', viewBox: { x: -10, y: 0, width: 200, height: 100 } });
    const [translateX, translateY, scale] = (
      svg.match(/translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+)\)/)?.slice(1) ?? []
    ).map(Number);

    expect(scale).toBeCloseTo(0.2);
    expect(translateX).toBeCloseTo(52);
    expect(translateY).toBeCloseTo(60);
    expect(svg).toContain('<circle r="5"/>');
  });
});

describe('decodeDataUrl and dataUrlToBlob', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Añadir ✓</text></svg>';

  it('decodes base64 payloads as bytes', () => {
    const decoded = decodeDataUrl(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    expect(decoded?.mimeType).toBe('image/svg+xml');
    expect(new TextDecoder().decode(decoded?.bytes)).toBe(svg);
  });

  it('decodes percent-encoded payloads as UTF-8', () => {
    const decoded = decodeDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    expect(new TextDecoder().decode(decoded?.bytes)).toBe(svg);
  });

  it('rejects anything that is not a well-formed data URL', () => {
    expect(decodeDataUrl('https://example.com/logo.png')).toBeNull();
    expect(decodeDataUrl('data:image/png;base64')).toBeNull();
    expect(decodeDataUrl('data:image/png;base64,@@@')).toBeNull();
    expect(dataUrlToBlob('not a data url')).toBeNull();
  });

  it('builds a typed blob with the original bytes', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const blob = dataUrlToBlob(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);

    expect(blob?.type).toBe('image/png');
    expect(new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);
  });
});

describe('generateQR', () => {
  it('renders a PNG of the requested width', async () => {
    const dataUrl = await generateQR('HELLO WORLD', { errorCorrectionLevel: 'Q', width: 230, margin: 1 });
    const png = Buffer.from(decodeDataUrl(dataUrl)?.bytes ?? []);

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(230);
    expect(png.readUInt32BE(20)).toBe(230);
  });

  it('is deterministic and depends on the error correction level', async () => {
    const first = await generateQR('same input', { errorCorrectionLevel: 'M' });
    expect(await generateQR('same input', { errorCorrectionLevel: 'M' })).toBe(first);
    expect(await generateQR('same input', { errorCorrectionLevel: 'H' })).not.toBe(first);
  });
});
