export const IMAGE_FORMATS = ['webp', 'png', 'jpeg'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export const FORMAT_NAMES: Record<ImageFormat, string> = {
  webp: 'WebP',
  png: 'PNG',
  jpeg: 'JPEG',
};

export const MIN_QUALITY = 0.1;
export const MAX_QUALITY = 1;
export const DEFAULT_QUALITY = 0.9;

export const DIMENSIONS = ['width', 'height'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Dimensions = Record<Dimension, number>;
export type SizeInputs = Record<Dimension, string>;

export interface CropRect extends Dimensions {
  x: number;
  y: number;
}

export interface ResizeOptions {
  width?: number;
  height?: number;
  maintainAspectRatio?: boolean;
}

export interface EncodingSettings {
  format: ImageFormat;
  quality: number;
  keepOriginalFormat: boolean;
}

export interface ConversionOptions {
  format: ImageFormat;
  quality: number;
  resize?: ResizeOptions;
}

export interface EncodedImage extends Dimensions {
  dataUrl: string;
  size: number;
}

export interface ConvertedImage extends EncodedImage {
  format: ImageFormat;
}

export interface SourceImage extends EncodedImage {
  name: string;
  type: string;
}

type FileInfo = Pick<File, 'name' | 'type'>;

const MIME_FORMATS = new Map<string, ImageFormat>([
  ['image/webp', 'webp'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
]);

export function mimeTypeForFormat(format: ImageFormat): string {
  return `image/${format}`;
}

export function formatFromMimeType(mimeType: string): ImageFormat | null {
  return MIME_FORMATS.get(mimeType.split(';')[0].trim().toLowerCase()) ?? null;
}

export function formatFromDataUrl(dataUrl: string): ImageFormat | null {
  const match = /^data:([^;,]*)[;,]/i.exec(dataUrl);
  return match ? formatFromMimeType(match[1]) : null;
}

export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return 0;

  const payload = dataUrl.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isHeicFile({ name, type }: FileInfo): boolean {
  return /\.hei[cf]$/i.test(name) || /^image\/hei[cf]$/i.test(type);
}

export function isImageFile(file: FileInfo): boolean {
  return file.type.startsWith('image/') || isHeicFile(file);
}

export function replaceExtension(fileName: string, extension: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base || 'image'}.${extension}`;
}

export function clampQuality(quality: number): number {
  if (Number.isNaN(quality)) return DEFAULT_QUALITY;
  return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, quality));
}

export function resolveEncoding(
  settings: EncodingSettings,
  sourceMimeType: string
): Omit<ConversionOptions, 'resize'> {
  if (settings.keepOriginalFormat) {
    return { format: formatFromMimeType(sourceMimeType) ?? settings.format, quality: MAX_QUALITY };
  }

  return {
    format: settings.format,
    quality: settings.format === 'png' ? MAX_QUALITY : clampQuality(settings.quality),
  };
}

export function parseDimension(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toPixels(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.round(value) : undefined;
}

function scaleSide(side: number, target: number, reference: number): number {
  return Math.max(1, Math.round((side * target) / reference));
}

export function calculateOutputSize(source: Dimensions, resize: ResizeOptions = {}): Dimensions {
  const width = toPixels(resize.width);
  const height = toPixels(resize.height);
  const keepRatio = resize.maintainAspectRatio ?? true;

  if (width && height) return { width, height };
  if (width) return { width, height: keepRatio ? scaleSide(source.height, width, source.width) : source.height };
  if (height) return { width: keepRatio ? scaleSide(source.width, height, source.height) : source.width, height };
  return { width: source.width, height: source.height };
}

export function syncAspectRatio(inputs: SizeInputs, edited: Dimension, source: Dimensions): SizeInputs {
  const value = parseDimension(inputs[edited]);
  if (!value) return inputs;

  if (edited === 'width') {
    return { ...inputs, height: String(calculateOutputSize(source, { width: value }).height) };
  }
  return { ...inputs, width: String(calculateOutputSize(source, { height: value }).width) };
}

function toEdge(percent: number, length: number, min = 0): number {
  return Math.min(length, Math.max(min, Math.round((percent * length) / 100)));
}

export function cropToPixels(percentCrop: CropRect, source: Dimensions): CropRect {
  const x = toEdge(percentCrop.x, source.width);
  const y = toEdge(percentCrop.y, source.height);

  return {
    x,
    y,
    width: toEdge(percentCrop.x + percentCrop.width, source.width, x) - x,
    height: toEdge(percentCrop.y + percentCrop.height, source.height, y) - y,
  };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unexpected file reader result'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image'));
    image.src = src;
  });
}

function naturalSize(image: HTMLImageElement): Dimensions {
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function createCanvas({ width, height }: Dimensions) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { colorSpace: 'display-p3' });
  if (!context) throw new Error('Canvas 2D context unavailable');
  return { canvas, context };
}

function encodeCanvas(canvas: HTMLCanvasElement, format: ImageFormat, quality?: number): ConvertedImage {
  const dataUrl = canvas.toDataURL(mimeTypeForFormat(format), quality);
  const encoded = formatFromDataUrl(dataUrl);
  if (!encoded) throw new Error('Failed to encode image');

  return { dataUrl, format: encoded, width: canvas.width, height: canvas.height, size: dataUrlByteLength(dataUrl) };
}

async function decodeHeic(file: File): Promise<File> {
  const { default: libheif } = await import('libheif-js/wasm-bundle');
  const [image] = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer())) ?? [];
  if (!image) throw new Error('No image found in HEIC file');

  const size = { width: image.get_width(), height: image.get_height() };
  const { canvas, context } = createCanvas(size);
  const pixels = context.createImageData(size.width, size.height, { colorSpace: 'display-p3' });

  await new Promise<void>((resolve, reject) => {
    image.display(pixels, result => {
      if (!result) {
        reject(new Error('Failed to render HEIC image'));
        return;
      }
      context.putImageData(result, 0, 0);
      resolve();
    });
  });

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('Failed to encode HEIC image');
  return new File([blob], replaceExtension(file.name, 'jpg'), { type: 'image/jpeg' });
}

async function readImageFile(file: File): Promise<SourceImage> {
  const dataUrl = await readAsDataUrl(file);
  const image = await decodeImage(dataUrl);
  return { ...naturalSize(image), dataUrl, size: file.size, name: file.name, type: file.type };
}

export async function openImage(file: File): Promise<SourceImage> {
  try {
    return await readImageFile(file);
  } catch (error) {
    if (!isHeicFile(file)) throw error;
    return readImageFile(await decodeHeic(file));
  }
}

export async function convertImage(source: string, options: ConversionOptions): Promise<ConvertedImage> {
  const image = await decodeImage(source);
  const size = calculateOutputSize(naturalSize(image), options.resize);
  const { canvas, context } = createCanvas(size);

  if (options.format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  return encodeCanvas(canvas, options.format, clampQuality(options.quality));
}

export async function cropImage(source: string, percentCrop: CropRect): Promise<ConvertedImage> {
  const image = await decodeImage(source);
  const area = cropToPixels(percentCrop, naturalSize(image));
  if (area.width < 1 || area.height < 1) throw new Error('The crop area is empty');

  const { canvas, context } = createCanvas(area);
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return encodeCanvas(canvas, 'png');
}

export function downloadImage(image: ConvertedImage, originalName: string): void {
  const link = document.createElement('a');
  link.href = image.dataUrl;
  link.download = replaceExtension(originalName, image.format);
  link.click();
}
