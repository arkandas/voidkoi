import QRCode from 'qrcode';

export const QR_TYPES = ['url', 'text', 'wifi', 'email', 'sms', 'phone'] as const;
export type QRCodeType = (typeof QR_TYPES)[number];

export const QR_STYLES = ['standard', 'pcb'] as const;
export type QRStyle = (typeof QR_STYLES)[number];

export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type ErrorCorrectionLevel = (typeof ERROR_CORRECTION_LEVELS)[number];

export const WIFI_SECURITY_TYPES = ['WPA', 'WEP', 'nopass'] as const;
export type WiFiSecurity = (typeof WIFI_SECURITY_TYPES)[number];

export type QRContentError = 'required' | 'invalidUrl' | 'invalidEmail' | 'invalidPhone';
export type QRContentResult = { valid: true; content: string } | { valid: false; error: QRContentError };

export interface WiFiConfig {
  ssid: string;
  password: string;
  encryption: WiFiSecurity;
}

export interface QRFields {
  url: string;
  text: string;
  ssid: string;
  password: string;
  security: WiFiSecurity;
  email: string;
  subject: string;
  body: string;
  phone: string;
  message: string;
}

export interface QRImageOptions {
  errorCorrectionLevel?: ErrorCorrectionLevel;
  width?: number;
  margin?: number;
}

export interface PcbQROptions {
  errorCorrectionLevel?: ErrorCorrectionLevel;
  margin?: number;
  logoDataUrl?: string;
  logoSizePercent?: number;
}

export interface QRMatrix {
  size: number;
  get(row: number, col: number): number | boolean;
}

export interface ModuleCorners {
  topLeft: boolean;
  topRight: boolean;
  bottomRight: boolean;
  bottomLeft: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoBox {
  x: number;
  y: number;
  size: number;
}

export interface PcbModule {
  x: number;
  y: number;
  corners: ModuleCorners;
}

export interface PcbLayout {
  size: number;
  moduleSize: number;
  radius: number;
  modules: PcbModule[];
  logo: LogoBox | null;
}

export interface PcbLayoutOptions {
  margin?: number;
  withLogo?: boolean;
  logoSizePercent?: number;
}

export interface SvgLogo {
  content: string;
  viewBox: Rect;
}

export interface DecodedDataUrl {
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export const EMPTY_QR_FIELDS: QRFields = {
  url: '',
  text: '',
  ssid: '',
  password: '',
  security: 'WPA',
  email: '',
  subject: '',
  body: '',
  phone: '',
  message: '',
};

export const DEFAULT_QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  width: 400,
  margin: 1,
  padding: 20,
  cornerRadius: 24,
  logoSizePercent: 20,
  color: { dark: '#000000', light: '#ffffff' },
} as const;

export const DEFAULT_PCB_OPTIONS = {
  errorCorrectionLevel: 'H',
  margin: 2,
  logoSizePercent: 22,
} as const;

const PCB_PNG_MODULE_SIZE = 30;
const PCB_SVG_MODULE_SIZE = 10;
const MODULE_CORNER_RATIO = 0.35;
const LOGO_BACKDROP_RATIO = 0.6;
const LOGO_BACKING_PADDING_RATIO = 0.14;
const LOGO_BACKING_CORNER_RATIO = 0.22;
const MAX_LOGO_SIZE_PERCENT = 30;
const ALL_CORNERS: ModuleCorners = { topLeft: true, topRight: true, bottomRight: true, bottomLeft: true };

const URL_SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{3,15}$/;
const PHONE_SEPARATORS = /[\s().-]/g;
const WIFI_SPECIAL_CHARACTERS = /[\\;,":]/g;

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return URL_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(PHONE_SEPARATORS, '');
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(phone));
}

function escapeWiFiValue(value: string): string {
  return value.replace(WIFI_SPECIAL_CHARACTERS, '\\$&');
}

export function formatWiFiString({ ssid, password, encryption }: WiFiConfig): string {
  const passwordField = encryption === 'nopass' ? '' : `P:${escapeWiFiValue(password)};`;
  return `WIFI:T:${encryption};S:${escapeWiFiValue(ssid)};${passwordField};`;
}

export function formatEmailString(email: string, subject = '', body = ''): string {
  const params: string[] = [];
  if (subject.trim()) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body.trim()) params.push(`body=${encodeURIComponent(body)}`);

  const address = `mailto:${email.trim()}`;
  return params.length > 0 ? `${address}?${params.join('&')}` : address;
}

export function formatSMSString(phone: string, message = ''): string {
  const address = `sms:${normalizePhone(phone)}`;
  return message.trim() ? `${address}?body=${encodeURIComponent(message)}` : address;
}

export function formatPhoneString(phone: string): string {
  return `tel:${normalizePhone(phone)}`;
}

const valid = (content: string): QRContentResult => ({ valid: true, content });
const invalid = (error: QRContentError): QRContentResult => ({ valid: false, error });

export function buildQRContent(type: QRCodeType, fields: QRFields): QRContentResult {
  switch (type) {
    case 'url': {
      const url = normalizeUrl(fields.url);
      if (!url) return invalid('required');
      return isValidUrl(url) ? valid(url) : invalid('invalidUrl');
    }
    case 'text':
      return fields.text.trim() ? valid(fields.text) : invalid('required');
    case 'wifi': {
      const needsPassword = fields.security !== 'nopass';
      if (!fields.ssid.trim() || (needsPassword && !fields.password)) return invalid('required');
      return valid(formatWiFiString({ ssid: fields.ssid, password: fields.password, encryption: fields.security }));
    }
    case 'email':
      if (!fields.email.trim()) return invalid('required');
      return isValidEmail(fields.email)
        ? valid(formatEmailString(fields.email, fields.subject, fields.body))
        : invalid('invalidEmail');
    case 'sms':
    case 'phone':
      if (!normalizePhone(fields.phone)) return invalid('required');
      if (!isValidPhone(fields.phone)) return invalid('invalidPhone');
      return valid(type === 'sms' ? formatSMSString(fields.phone, fields.message) : formatPhoneString(fields.phone));
  }
}

export function createQRMatrix(text: string, errorCorrectionLevel: ErrorCorrectionLevel): QRMatrix {
  return QRCode.create(text, { errorCorrectionLevel }).modules;
}

export function layoutPcbModules(matrix: QRMatrix, moduleSize: number, options: PcbLayoutOptions = {}): PcbLayout {
  const count = matrix.size;
  const margin = (options.margin ?? DEFAULT_PCB_OPTIONS.margin) * moduleSize;
  const size = count * moduleSize + margin * 2;
  const logoPercent = options.logoSizePercent ?? DEFAULT_PCB_OPTIONS.logoSizePercent;
  const logoSize = options.withLogo ? Math.floor((count * moduleSize * logoPercent) / 100) : 0;
  const logoStart = Math.floor((count - logoSize / moduleSize) / 2);
  const logoEnd = Math.ceil((count + logoSize / moduleSize) / 2);

  const inLogo = (row: number, col: number) =>
    logoSize > 0 && row >= logoStart && row < logoEnd && col >= logoStart && col < logoEnd;
  const filled = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < count && col < count && Boolean(matrix.get(row, col)) && !inLogo(row, col);

  const modules: PcbModule[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!filled(row, col)) continue;

      const top = filled(row - 1, col);
      const right = filled(row, col + 1);
      const bottom = filled(row + 1, col);
      const left = filled(row, col - 1);

      modules.push({
        x: margin + col * moduleSize,
        y: margin + row * moduleSize,
        corners: {
          topLeft: !top && !left,
          topRight: !top && !right,
          bottomRight: !bottom && !right,
          bottomLeft: !bottom && !left,
        },
      });
    }
  }

  const logoOffset = (size - logoSize) / 2;
  return {
    size,
    moduleSize,
    radius: moduleSize * MODULE_CORNER_RATIO,
    modules,
    logo: logoSize > 0 ? { x: logoOffset, y: logoOffset, size: logoSize } : null,
  };
}

export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  corners: ModuleCorners
): string {
  const right = x + width;
  const bottom = y + height;
  const r = radius;

  return [
    corners.topLeft ? `M${x + r},${y}` : `M${x},${y}`,
    corners.topRight ? `L${right - r},${y} Q${right},${y} ${right},${y + r}` : `L${right},${y}`,
    corners.bottomRight ? `L${right},${bottom - r} Q${right},${bottom} ${right - r},${bottom}` : `L${right},${bottom}`,
    corners.bottomLeft ? `L${x + r},${bottom} Q${x},${bottom} ${x},${bottom - r}` : `L${x},${bottom}`,
    corners.topLeft ? `L${x},${y + r} Q${x},${y} ${x + r},${y}` : `L${x},${y}`,
    'Z',
  ].join(' ');
}

export function modulesPath(layout: PcbLayout): string {
  return layout.modules
    .map(({ x, y, corners }) => roundedRectPath(x, y, layout.moduleSize, layout.moduleSize, layout.radius, corners))
    .join(' ');
}

export function fitInBox(width: number, height: number, box: LogoBox): Rect {
  if (!(width > 0 && height > 0)) return { x: box.x, y: box.y, width: box.size, height: box.size };

  const scale = box.size / Math.max(width, height);
  return {
    x: box.x + (box.size - width * scale) / 2,
    y: box.y + (box.size - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

export function centerLogoBox(size: number, sizePercent: number = DEFAULT_QR_OPTIONS.logoSizePercent): LogoBox {
  const percent = Math.min(Math.max(sizePercent, 0), MAX_LOGO_SIZE_PERCENT);
  const box = Math.round((size * percent) / 100);
  const offset = (size - box) / 2;
  return { x: offset, y: offset, size: box };
}

export function parseViewBox(viewBox: string | null, width: string | null = null, height: string | null = null): Rect | null {
  const source = viewBox?.trim();
  const [x, y, w, h] = source
    ? source.split(/[\s,]+/).map(Number)
    : [0, 0, parseFloat(width ?? '100'), parseFloat(height ?? '100')];

  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}

export function renderPcbSvg(layout: PcbLayout, logo: SvgLogo | null = null): string {
  const { size } = layout;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `  <path d="${modulesPath(layout)}" fill="${DEFAULT_QR_OPTIONS.color.dark}"/>`,
  ];

  if (logo && layout.logo) {
    const fit = fitInBox(logo.viewBox.width, logo.viewBox.height, layout.logo);
    const scale = fit.width / logo.viewBox.width;
    lines.push(
      `  <g transform="translate(${fit.x - logo.viewBox.x * scale}, ${fit.y - logo.viewBox.y * scale}) scale(${scale})">`,
      `    ${logo.content}`,
      '  </g>'
    );
  }

  lines.push('</svg>');
  return lines.join('\n');
}

export function decodeDataUrl(dataUrl: string): DecodedDataUrl | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) return null;

  const [mimeType, ...parameters] = dataUrl.slice(5, comma).split(';');
  const payload = dataUrl.slice(comma + 1);

  try {
    const bytes = parameters.some(parameter => parameter.toLowerCase() === 'base64')
      ? Uint8Array.from(atob(payload), char => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload));
    return { mimeType: mimeType || 'text/plain', bytes };
  } catch {
    return null;
  }
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const decoded = decodeDataUrl(dataUrl);
  return decoded && new Blob([decoded.bytes], { type: decoded.mimeType });
}

export function generateQR(text: string, options: QRImageOptions = {}): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? DEFAULT_QR_OPTIONS.errorCorrectionLevel,
    width: options.width ?? DEFAULT_QR_OPTIONS.width,
    margin: options.margin ?? DEFAULT_QR_OPTIONS.margin,
    color: DEFAULT_QR_OPTIONS.color,
  });
}

function createPcbLayout(text: string, moduleSize: number, options: PcbQROptions): PcbLayout {
  const matrix = createQRMatrix(text, options.errorCorrectionLevel ?? DEFAULT_PCB_OPTIONS.errorCorrectionLevel);
  return layoutPcbModules(matrix, moduleSize, {
    margin: options.margin,
    withLogo: Boolean(options.logoDataUrl),
    logoSizePercent: options.logoSizePercent,
  });
}

function parseSvgLogo(dataUrl: string): SvgLogo | null {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;

  const source = new TextDecoder().decode(decoded.bytes);
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').querySelector('svg');
  if (!svg) return null;

  const viewBox = parseViewBox(svg.getAttribute('viewBox'), svg.getAttribute('width'), svg.getAttribute('height'));
  return viewBox && { content: svg.innerHTML, viewBox };
}

export function generatePCBQRSvg(text: string, options: PcbQROptions = {}): string {
  const layout = createPcbLayout(text, PCB_SVG_MODULE_SIZE, options);
  const logo = options.logoDataUrl?.startsWith('data:image/svg+xml') ? parseSvgLogo(options.logoDataUrl) : null;
  return renderPcbSvg(layout, logo);
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is not available');
  return { canvas, context };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded'));
    image.src = src;
  });
}

export async function generatePCBQRPng(text: string, options: PcbQROptions = {}): Promise<string> {
  const layout = createPcbLayout(text, PCB_PNG_MODULE_SIZE, options);
  const { dark, light } = DEFAULT_QR_OPTIONS.color;
  const { canvas, context } = createCanvas(layout.size, layout.size);

  context.fillStyle = light;
  context.fillRect(0, 0, layout.size, layout.size);
  context.fillStyle = dark;
  context.fill(new Path2D(modulesPath(layout)));

  if (options.logoDataUrl && layout.logo) {
    const image = await loadImage(options.logoDataUrl);
    const center = layout.size / 2;
    const fit = fitInBox(image.naturalWidth, image.naturalHeight, layout.logo);

    context.fillStyle = light;
    context.beginPath();
    context.arc(center, center, layout.logo.size * LOGO_BACKDROP_RATIO, 0, Math.PI * 2);
    context.fill();
    context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  }

  return canvas.toDataURL('image/png');
}

export async function overlayLogo(imageDataUrl: string, logoDataUrl: string, sizePercent?: number): Promise<string> {
  const [image, logo] = await Promise.all([loadImage(imageDataUrl), loadImage(logoDataUrl)]);
  const { canvas, context } = createCanvas(image.width, image.height);
  context.drawImage(image, 0, 0);

  const box = centerLogoBox(image.width, sizePercent);
  if (box.size > 0) {
    const padding = box.size * LOGO_BACKING_PADDING_RATIO;
    const backing = box.size + padding * 2;
    const fit = fitInBox(logo.naturalWidth, logo.naturalHeight, box);

    context.fillStyle = DEFAULT_QR_OPTIONS.color.light;
    context.fill(
      new Path2D(
        roundedRectPath(
          box.x - padding,
          box.y - padding,
          backing,
          backing,
          backing * LOGO_BACKING_CORNER_RATIO,
          ALL_CORNERS
        )
      )
    );
    context.drawImage(logo, fit.x, fit.y, fit.width, fit.height);
  }

  return canvas.toDataURL('image/png');
}

export async function applyRoundedCorners(imageDataUrl: string): Promise<string> {
  const image = await loadImage(imageDataUrl);
  const { padding, cornerRadius, color } = DEFAULT_QR_OPTIONS;
  const width = image.width + padding * 2;
  const height = image.height + padding * 2;
  const { canvas, context } = createCanvas(width, height);

  context.fillStyle = color.light;
  context.fill(new Path2D(roundedRectPath(0, 0, width, height, cornerRadius, ALL_CORNERS)));
  context.drawImage(image, padding, padding);

  return canvas.toDataURL('image/png');
}
