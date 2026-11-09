export interface IconFile {
  name: string;
  size: number;
  opaque?: boolean;
}

export const PNG_ICONS: readonly IconFile[] = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180, opaque: true },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

export const ICO_SIZES = [16, 32, 48] as const;
export const PREVIEW_SIZES = [16, 32, 48, 180, 192, 512] as const;

export interface IconStyle {
  background: string | null;
  padding: number;
  radius: number;
}

export interface ManifestOptions {
  name: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
}

export function encodeIco(images: ReadonlyArray<{ size: number; data: Uint8Array }>): Uint8Array {
  const headerSize = 6 + images.length * 16;
  const buffer = new Uint8Array(headerSize + images.reduce((total, image) => total + image.data.length, 0));
  const view = new DataView(buffer.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    const dimension = image.size >= 256 ? 0 : image.size;
    view.setUint8(entry, dimension);
    view.setUint8(entry + 1, dimension);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.data.length, true);
    view.setUint32(entry + 12, offset, true);
    buffer.set(image.data, offset);
    offset += image.data.length;
  });

  return buffer;
}

export function webManifest({ name, shortName, themeColor, backgroundColor }: ManifestOptions): string {
  return `${JSON.stringify(
    {
      name,
      short_name: shortName || name,
      icons: [
        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: themeColor,
      background_color: backgroundColor,
      display: 'standalone',
    },
    null,
    2
  )}\n`;
}

export function headSnippet({ svg, themeColor }: { svg: boolean; themeColor: string }): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    ...(svg ? ['<link rel="icon" href="/favicon.svg" type="image/svg+xml">'] : []),
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${themeColor}">`,
  ].join('\n');
}

export function iconLayout(size: number, sourceWidth: number, sourceHeight: number, padding: number) {
  const inner = size * (1 - 2 * Math.min(Math.max(padding, 0), 0.4));
  const scale = inner / Math.max(sourceWidth || 1, sourceHeight || 1);
  const width = (sourceWidth || 1) * scale;
  const height = (sourceHeight || 1) * scale;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function wrapSvg(inner: string, viewBox: { x: number; y: number; width: number; height: number }, style: IconStyle): string {
  const size = 512;
  const layout = iconLayout(size, viewBox.width, viewBox.height, style.padding);
  const box = { x: round(layout.x), y: round(layout.y), width: round(layout.width), height: round(layout.height) };
  const radius = round(Math.min(Math.max(style.radius, 0), 0.5) * size);
  const background = style.background
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${style.background}"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    background,
    `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">${inner}</svg>`,
    '</svg>',
  ].join('');
}
