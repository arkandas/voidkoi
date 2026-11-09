'use client';

import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { strToU8, zipSync } from 'fflate';
import { useTranslations } from 'next-intl';
import { Download, ImageUp, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import {
  encodeIco,
  headSnippet,
  ICO_SIZES,
  iconLayout,
  PNG_ICONS,
  PREVIEW_SIZES,
  webManifest,
  wrapSvg,
  type IconStyle,
} from '@/modules/utilikit/lib/favicon';
import { parseViewBox, type Rect } from '@/modules/utilikit/lib/qr-generator';
import { Alert, Button, Card, CardTitle, Input, Segmented, Spinner } from '@/components/ui';

const FILES = ['ico', 'png', 'apple', 'android', 'svg', 'manifest'] as const;
const CHECKERBOARD =
  'repeating-conic-gradient(var(--color-muted) 0% 25%, var(--color-surface) 0% 50%) 50% / 12px 12px';

interface Source {
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  svg: { inner: string; viewBox: Rect } | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded'));
    image.src = url;
  });
}

async function openSource(file: File): Promise<Source> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

  if (isSvg) {
    const document = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
    const root = document.querySelector('svg');
    const viewBox = root && parseViewBox(root.getAttribute('viewBox'), root.getAttribute('width'), root.getAttribute('height'));
    if (root && viewBox) {
      const inner = root.innerHTML;
      root.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
      root.setAttribute('width', String(512 * (viewBox.width / Math.max(viewBox.width, viewBox.height))));
      root.setAttribute('height', String(512 * (viewBox.height / Math.max(viewBox.width, viewBox.height))));
      const blob = new Blob([new XMLSerializer().serializeToString(document)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const image = await loadImage(url);
      return { url, image, width: viewBox.width, height: viewBox.height, svg: { inner, viewBox } };
    }
  }

  const url = URL.createObjectURL(file);
  const image = await loadImage(url);
  return { url, image, width: image.naturalWidth, height: image.naturalHeight, svg: null };
}

function createCanvas(width: number, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return { canvas, context };
}

function drawScaled(context: CanvasRenderingContext2D, source: Source, box: ReturnType<typeof iconLayout>) {
  let current: CanvasImageSource = source.image;
  let width = source.width;
  let height = source.height;

  if (!source.svg) {
    while (width / 2 >= box.width && height / 2 >= box.height) {
      width = Math.ceil(width / 2);
      height = Math.ceil(height / 2);
      const step = createCanvas(width, height);
      step.context.drawImage(current, 0, 0, width, height);
      current = step.canvas;
    }
  }

  context.drawImage(current, box.x, box.y, box.width, box.height);
}

function drawIcon(source: Source, size: number, style: IconStyle, opaque = false): HTMLCanvasElement {
  const { canvas, context } = createCanvas(size);
  const background = style.background ?? (opaque ? '#ffffff' : null);

  if (background) {
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(0, 0, size, size, opaque ? 0 : Math.min(style.radius, 0.5) * size);
    context.fill();
  }

  drawScaled(context, source, iconLayout(size, source.width, source.height, style.padding));
  return canvas;
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

export default function FaviconGenerator() {
  const t = useTranslations('utilikit.faviconGenerator');
  const [source, setSource] = useState<Source | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [useBackground, setUseBackground] = useState(false);
  const [background, setBackground] = useState('#2563eb');
  const [radius, setRadius] = useState(0.2);
  const [padding, setPadding] = useState(0.1);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [themeColor, setThemeColor] = useState('#2563eb');
  const [previews, setPreviews] = useState<Array<{ size: number; url: string }>>([]);
  const [building, setBuilding] = useState(false);

  const style: IconStyle = { background: useBackground ? background : null, padding, radius };
  const appName = name.trim() || t('defaultName');
  const snippet = headSnippet({ svg: Boolean(source?.svg), themeColor });

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!source) return;
    const iconStyle: IconStyle = { background: useBackground ? background : null, padding, radius };
    const timer = setTimeout(() => {
      setPreviews(
        PREVIEW_SIZES.map(size => ({ size, url: drawIcon(source, size, iconStyle, size === 180).toDataURL('image/png') }))
      );
    }, 60);
    return () => clearTimeout(timer);
  }, [source, useBackground, background, padding, radius]);

  const handleFile = async ([file]: File[]) => {
    setLoadError(false);
    if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name)) {
      setLoadError(true);
      return;
    }

    try {
      const opened = await openSource(file);
      setPreviews([]);
      setSource(opened);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      console.error('Favicon source error:', error);
      setLoadError(true);
    }
  };

  const reset = () => {
    setSource(null);
    setPreviews([]);
  };

  const downloadZip = async () => {
    if (!source) return;
    setBuilding(true);

    try {
      const files: Record<string, Uint8Array> = {};
      for (const icon of PNG_ICONS) files[icon.name] = await pngBytes(drawIcon(source, icon.size, style, icon.opaque));

      const icoImages = [];
      for (const size of ICO_SIZES) icoImages.push({ size, data: await pngBytes(drawIcon(source, size, style)) });
      files['favicon.ico'] = encodeIco(icoImages);

      if (source.svg) files['favicon.svg'] = strToU8(wrapSvg(source.svg.inner, source.svg.viewBox, style));
      files['site.webmanifest'] = strToU8(
        webManifest({ name: appName, shortName: shortName.trim(), themeColor, backgroundColor: style.background ?? '#ffffff' })
      );
      files['favicon-snippet.html'] = strToU8(`${snippet}\n`);

      const zip = zipSync(files, { level: 0 });
      saveAs(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), 'favicon.zip');
    } catch (error) {
      console.error('Favicon ZIP error:', error);
    } finally {
      setBuilding(false);
    }
  };

  const tabIcon = previews.find(preview => preview.size === 32)?.url;

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        {!source && (
          <Card>
            <Dropzone
              onFiles={handleFile}
              title={t('dropTitle')}
              hint={t('dropHint')}
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
              icon={ImageUp}
            />
            {loadError && <Alert className="mt-4">{t('loadFailed')}</Alert>}
          </Card>
        )}

        {source && (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <Card className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <CardTitle>{t('appearance')}</CardTitle>
                <Button onClick={reset} variant="ghost" size="sm" aria-label={t('change')} title={t('change')}>
                  <X size={16} />
                </Button>
              </div>

              <div className="space-y-5">
                <div>
                  <Label>{t('background')}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented
                      value={useBackground ? 'color' : 'transparent'}
                      onChange={value => setUseBackground(value === 'color')}
                      options={[
                        { value: 'transparent', label: t('transparent') },
                        { value: 'color', label: t('color') },
                      ]}
                      ariaLabel={t('background')}
                    />
                    {useBackground && (
                      <input
                        type="color"
                        value={background}
                        onChange={event => setBackground(event.target.value)}
                        aria-label={t('backgroundColor')}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-raised p-1"
                      />
                    )}
                  </div>
                </div>

                {useBackground && (
                  <Slider label={t('radius', { value: radius })} value={radius} max={0.5} onChange={setRadius} />
                )}
                <Slider label={t('padding', { value: padding })} value={padding} max={0.3} onChange={setPadding} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label={t('appName')} value={name} onChange={event => setName(event.target.value)} placeholder={t('defaultName')} />
                  <Input label={t('shortName')} value={shortName} onChange={event => setShortName(event.target.value)} placeholder={appName} />
                </div>
                <div>
                  <Label htmlFor="theme-color">{t('themeColor')}</Label>
                  <input
                    id="theme-color"
                    type="color"
                    value={themeColor}
                    onChange={event => setThemeColor(event.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-raised p-1"
                  />
                </div>

                <Button onClick={downloadZip} className="w-full" size="lg" disabled={building || previews.length === 0}>
                  {building ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                  {building ? t('building') : t('download')}
                </Button>
              </div>
            </Card>

            <Card className="min-w-0">
              <CardTitle className="mb-4">{t('preview')}</CardTitle>

              <div className="mb-5 flex items-end gap-0 rounded-t-lg bg-muted px-3 pt-2">
                <div className="flex h-9 max-w-64 min-w-0 items-center gap-2 rounded-t-lg bg-surface px-3 text-sm text-ink shadow-xs">
                  {tabIcon && <img src={tabIcon} alt="" width={16} height={16} className="shrink-0" />}
                  <span className="truncate">{appName}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {previews.map(({ size, url }) => (
                  <figure key={size} className="flex flex-col items-center gap-2 rounded-lg border border-line p-3" style={{ background: CHECKERBOARD }}>
                    <div className="flex h-24 items-center justify-center">
                      <img
                        src={url}
                        alt={t('previewAlt', { size })}
                        width={Math.min(size, 96)}
                        height={Math.min(size, 96)}
                        style={{ imageRendering: size <= 48 ? 'pixelated' : 'auto' }}
                      />
                    </div>
                    <figcaption className="text-xs font-medium text-ink-muted">
                      {size}×{size}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          </div>
        )}

        {source && (
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <CardTitle>{t('snippet')}</CardTitle>
              <CopyButton value={snippet} />
            </div>
            <Well mono className="overflow-auto whitespace-pre text-xs">
              {snippet}
            </Well>
          </Card>
        )}

        <GuideCard>
          <CardTitle className="mb-3">{t('files')}</CardTitle>
          <ul className="grid grid-cols-1 gap-2 text-sm text-ink-muted md:grid-cols-2">
            {FILES.map(file => (
              <li key={file}>{t(`fileDescriptions.${file}`)}</li>
            ))}
          </ul>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

interface SliderProps {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function Slider({ label, value, max, onChange }: SliderProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="range w-full"
      />
    </label>
  );
}
