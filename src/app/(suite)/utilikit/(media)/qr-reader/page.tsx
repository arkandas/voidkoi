'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, ImageUp, ScanQrCode, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { CopyButton } from '@/modules/utilikit/components/ui/copy-button';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Well } from '@/modules/utilikit/components/ui/well';
import { decodeQr, DECODE_SIZES, parseQrContent, type QrContent } from '@/modules/utilikit/lib/qr-reader';
import { Alert, Button, Card, CardTitle, Spinner } from '@/components/ui';

const SECURITY = ['WPA', 'WEP', 'nopass'] as const;
const isSecurity = (value: string): value is (typeof SECURITY)[number] => (SECURITY as readonly string[]).includes(value);

type Scan =
  | { status: 'reading' }
  | { status: 'found'; text: string; content: QrContent }
  | { status: 'notFound' }
  | { status: 'failed' };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded'));
    image.src = url;
  });
}

async function scanImage(url: string): Promise<string | null> {
  const image = await loadImage(url);
  const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1000;
  const tried = new Set<number>();

  for (const size of DECODE_SIZES) {
    const scale = Math.min(1, size / longest);
    const width = Math.max(1, Math.round((image.naturalWidth || size) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || size) * scale));
    if (tried.has(width)) continue;
    tried.add(width);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const text = decodeQr(context.getImageData(0, 0, width, height).data, width, height);
    if (text !== null) return text;
  }

  return null;
}

export default function QrReader() {
  const t = useTranslations('utilikit.qrReader');
  const locale = useLocale();
  const [image, setImage] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });

  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image);
  }, [image]);

  const read = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setScan({ status: 'failed' });
      return;
    }

    const url = URL.createObjectURL(file);
    setImage(url);
    setScan({ status: 'reading' });

    try {
      const text = await scanImage(url);
      setScan(text === null ? { status: 'notFound' } : { status: 'found', text, content: parseQrContent(text) });
    } catch (error) {
      console.error('QR scan error:', error);
      setScan({ status: 'failed' });
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void read(file);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const reset = () => {
    setImage(null);
    setScan(null);
  };

  const rows = (content: QrContent): Array<[string, string, boolean?]> => {
    switch (content.kind) {
      case 'url':
        return [[t('fields.url'), content.url]];
      case 'wifi':
        return [
          [t('fields.ssid'), content.ssid],
          [t('fields.password'), content.password || '—'],
          [t('fields.security'), isSecurity(content.security) ? t(`security.${content.security}`) : content.security, false],
          [t('fields.hidden'), content.hidden ? t('yes') : t('no'), false],
        ];
      case 'email':
        return [
          [t('fields.address'), content.address],
          [t('fields.subject'), content.subject || '—'],
          [t('fields.body'), content.body || '—'],
        ];
      case 'phone':
        return [[t('fields.number'), content.number]];
      case 'sms':
        return [
          [t('fields.number'), content.number],
          [t('fields.message'), content.message || '—'],
        ];
      case 'geo':
        return [
          [t('fields.latitude'), number.format(content.latitude)],
          [t('fields.longitude'), number.format(content.longitude)],
        ];
      case 'text':
        return [];
    }
  };

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        {!image && (
          <Card>
            <Dropzone onFiles={([file]) => read(file)} title={t('dropTitle')} hint={t('dropHint')} accept="image/*" icon={ImageUp} />
            {scan?.status === 'failed' && <Alert className="mt-4">{t('loadFailed')}</Alert>}
          </Card>
        )}

        {image && (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Card className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <CardTitle>{t('image')}</CardTitle>
                <Button onClick={reset} variant="ghost" size="sm" aria-label={t('anotherImage')} title={t('anotherImage')}>
                  <X size={16} />
                </Button>
              </div>
              <img src={image} alt={t('image')} className="max-h-96 w-full rounded-lg border border-line bg-canvas object-contain" />
            </Card>

            <Card className="min-w-0">
              <CardTitle className="mb-4">
                <ScanQrCode size={18} className="shrink-0" />
                {t('result')}
              </CardTitle>

              {scan?.status === 'reading' && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Spinner size={16} className="text-current" />
                  {t('reading')}
                </p>
              )}
              {scan?.status === 'notFound' && <Alert tone="warning">{t('notFound')}</Alert>}
              {scan?.status === 'failed' && <Alert>{t('loadFailed')}</Alert>}

              {scan?.status === 'found' && (
                <div className="space-y-4">
                  <span className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    {t(`kinds.${scan.content.kind}`)}
                  </span>

                  {rows(scan.content).length > 0 && (
                    <dl className="divide-y divide-line rounded-lg border border-line">
                      {rows(scan.content).map(([label, value, copyable = true]) => (
                        <div key={label} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                          <dt className="w-28 shrink-0 text-ink-muted">{label}</dt>
                          <dd className="min-w-0 flex-1 font-medium text-ink wrap-anywhere">{value}</dd>
                          {copyable && value !== '—' && <CopyButton value={value} variant="ghost" className="-my-1" />}
                        </div>
                      ))}
                    </dl>
                  )}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink-muted">{t('raw')}</p>
                      <CopyButton value={scan.text} />
                    </div>
                    <Well mono className="max-h-48 overflow-auto whitespace-pre-wrap">
                      {scan.text}
                    </Well>
                  </div>

                  {scan.content.kind === 'url' && (
                    <a
                      href={scan.content.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                    >
                      <ExternalLink size={16} />
                      {t('openLink')}
                    </a>
                  )}
                  {scan.content.kind === 'geo' && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${scan.content.latitude}&mlon=${scan.content.longitude}#map=16/${scan.content.latitude}/${scan.content.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                    >
                      <ExternalLink size={16} />
                      {t('openMap')}
                    </a>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        <GuideCard>
          <CardTitle className="mb-3">{t('about')}</CardTitle>
          <p className="text-sm text-ink-muted">{t('aboutText')}</p>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}
