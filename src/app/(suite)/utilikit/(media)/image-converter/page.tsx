'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Maximize2, Scissors } from 'lucide-react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Well } from '@/modules/utilikit/components/ui/well';
import { formatBytes } from '@/lib/format';
import { formatPercentChange } from '@/modules/utilikit/lib/format';
import {
  convertImage,
  ConvertedImage,
  cropImage,
  cropToPixels,
  DEFAULT_QUALITY,
  Dimension,
  Dimensions,
  DIMENSIONS,
  downloadImage,
  EncodedImage,
  EncodingSettings,
  FORMAT_NAMES,
  IMAGE_FORMATS,
  isImageFile,
  MAX_QUALITY,
  MIN_QUALITY,
  openImage,
  parseDimension,
  resolveEncoding,
  SizeInputs,
  SourceImage,
  syncAspectRatio,
} from '@/modules/utilikit/lib/image-utils';
import { Alert, Button, Card, CardTitle, Input, Modal, Select, Spinner } from '@/components/ui';

const IMAGE_ACCEPT = 'image/*,.heic,.heif';
const DEFAULT_CROP: PercentCrop = { unit: '%', x: 25, y: 25, width: 50, height: 50 };
const ABOUT_TOPICS = ['formatConversion', 'resizeAndCrop', 'colorSpace'] as const;

interface Settings extends EncodingSettings {
  maintainAspectRatio: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  format: 'webp',
  quality: DEFAULT_QUALITY,
  keepOriginalFormat: false,
  maintainAspectRatio: true,
};

type ErrorCode = 'unsupportedFile' | 'loadFailed' | 'convertFailed' | 'cropFailed';

export default function ImageConverter() {
  const t = useTranslations('utilikit.imageConverter');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();

  const [original, setOriginal] = useState<SourceImage | null>(null);
  const [cropped, setCropped] = useState<ConvertedImage | null>(null);
  const [converted, setConverted] = useState<ConvertedImage | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sizeInputs, setSizeInputs] = useState<SizeInputs>({ width: '', height: '' });
  const [lastEdited, setLastEdited] = useState<Dimension | null>(null);
  const [cropSource, setCropSource] = useState<EncodedImage | null>(null);
  const [crop, setCrop] = useState<PercentCrop>(DEFAULT_CROP);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  const working = cropped ?? original;
  const preview = converted ?? working;
  const baseSize = cropped?.size ?? original?.size ?? 0;
  const reduction = converted ? formatPercentChange(baseSize, converted.size) : 0;
  const requestedFormat = original ? resolveEncoding(settings, original.type).format : null;
  const cropArea = cropSource ? cropToPixels(crop, cropSource) : null;
  const errorMessage = error && t(`errors.${error}`);

  const resetSize = ({ width, height }: Dimensions) => {
    setSizeInputs({ width: String(width), height: String(height) });
    setLastEdited(null);
  };

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings(current => ({ ...current, ...patch }));
    setConverted(null);
  };

  const changeFormat = (value: string) => {
    const format = IMAGE_FORMATS.find(candidate => candidate === value);
    if (format) updateSettings({ format });
  };

  const changeDimension = (dimension: Dimension, value: string) => {
    const inputs = { ...sizeInputs, [dimension]: value };
    setSizeInputs(settings.maintainAspectRatio && working ? syncAspectRatio(inputs, dimension, working) : inputs);
    setLastEdited(dimension);
    setConverted(null);
  };

  const changeAspectRatio = (maintainAspectRatio: boolean) => {
    updateSettings({ maintainAspectRatio });
    if (maintainAspectRatio && lastEdited && working) {
      setSizeInputs(syncAspectRatio(sizeInputs, lastEdited, working));
    }
  };

  const handleFiles = async ([file]: File[]) => {
    if (!isImageFile(file)) {
      setError('unsupportedFile');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const image = await openImage(file);
      setOriginal(image);
      resetSize(image);
    } catch (cause) {
      console.error(cause);
      setError('loadFailed');
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!original) return;

    setError(null);
    setLoading(true);
    try {
      const result = await convertImage((cropped ?? original).dataUrl, {
        ...resolveEncoding(settings, original.type),
        resize: {
          width: parseDimension(sizeInputs.width),
          height: parseDimension(sizeInputs.height),
          maintainAspectRatio: settings.maintainAspectRatio,
        },
      });
      setConverted(result);
    } catch (cause) {
      console.error(cause);
      setError('convertFailed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setOriginal(null);
    setCropped(null);
    setConverted(null);
    setError(null);
  };

  const openCrop = () => {
    setCropSource(preview);
    setCrop(DEFAULT_CROP);
    setError(null);
  };

  const closeCrop = () => {
    setCropSource(null);
    setError(null);
  };

  const applyCrop = async () => {
    if (!cropSource) return;

    setError(null);
    setLoading(true);
    try {
      const result = await cropImage(cropSource.dataUrl, crop);
      setCropped(result);
      setConverted(null);
      setCropSource(null);
      resetSize(result);
    } catch (cause) {
      console.error(cause);
      setError('cropFailed');
    } finally {
      setLoading(false);
    }
  };

  const clearCrop = () => {
    setCropped(null);
    setConverted(null);
    if (original) resetSize(original);
  };

  return (
    <ToolLayout>
      {!original && (
        <Card>
          <CardTitle className="mb-4">{t('uploadImage')}</CardTitle>
          {loading ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-ink-muted">
              <Spinner size={28} className="text-accent" />
              <p className="text-sm">{tc('loading')}</p>
            </div>
          ) : (
            <Dropzone
              onFiles={handleFiles}
              title={t('dropImage')}
              hint={t('supportedFormats')}
              accept={IMAGE_ACCEPT}
            />
          )}
          {errorMessage && <Alert className="mt-4">{errorMessage}</Alert>}
        </Card>
      )}

      {original && preview && (
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle className="mb-4">{tc('settings')}</CardTitle>
            <div className="space-y-6">
              <Alert tone="info">{t('metadataRemoved')}</Alert>

              <label className="flex items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={settings.keepOriginalFormat}
                  onChange={e => updateSettings({ keepOriginalFormat: e.target.checked })}
                  className="h-4 w-4"
                />
                {t('keepOriginalFormat')}
              </label>

              {!settings.keepOriginalFormat && (
                <Select
                  label={t('outputFormat')}
                  options={IMAGE_FORMATS.map(format => ({ value: format, label: t(`formats.${format}`) }))}
                  value={settings.format}
                  onChange={e => changeFormat(e.target.value)}
                />
              )}

              {!settings.keepOriginalFormat && settings.format !== 'png' && (
                <div>
                  <Label htmlFor="image-quality">{t('quality', { quality: settings.quality })}</Label>
                  <input
                    id="image-quality"
                    type="range"
                    min={MIN_QUALITY}
                    max={MAX_QUALITY}
                    step={0.05}
                    value={settings.quality}
                    onChange={e => updateSettings({ quality: Number(e.target.value) })}
                    className="range"
                  />
                  <div className="mt-1 flex justify-between gap-2 text-xs text-ink-muted">
                    <span>{t('smallerSize')}</span>
                    <span>{t('betterQuality')}</span>
                  </div>
                </div>
              )}

              <div className="border-t border-line pt-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Maximize2 size={16} />
                  {t('resizeOptional')}
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {DIMENSIONS.map(dimension => (
                      <Input
                        key={dimension}
                        label={t(`sizeLabels.${dimension}`)}
                        inputMode="numeric"
                        value={sizeInputs[dimension]}
                        onChange={e => changeDimension(dimension, e.target.value)}
                        placeholder={String((cropped ?? original)[dimension])}
                      />
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink min-h-10 sm:min-h-0">
                    <input
                      type="checkbox"
                      checked={settings.maintainAspectRatio}
                      onChange={e => changeAspectRatio(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {t('maintainAspectRatio')}
                  </label>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
                  <Scissors size={16} />
                  {t('cropImage')}
                </p>
                <div className="space-y-2">
                  <Button onClick={openCrop} variant="outline" className="w-full">
                    {t('openCropTool')}
                  </Button>
                  {cropped && (
                    <Button onClick={clearCrop} variant="outline" className="w-full">
                      {t('clearCrop')}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-4">
                {errorMessage && !cropSource && <Alert>{errorMessage}</Alert>}
                <Button onClick={handleConvert} className="w-full" disabled={loading}>
                  {loading ? tc('processing') : t('convertImage')}
                </Button>
                <Button onClick={handleClear} variant="outline" className="w-full">
                  {t('uploadNew')}
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">
              {converted ? t('converted') : cropped ? t('cropped') : t('original')}
            </CardTitle>
            <div className="space-y-4">
              <div className="checkerboard aspect-video overflow-hidden rounded-lg border border-line">
                <img
                  src={preview.dataUrl}
                  alt={tc('preview')}
                  className="pointer-events-none h-full w-full object-contain"
                />
              </div>

              <Well>
                <dl className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <dt className="text-ink-muted">{t('dimensions')}</dt>
                    <dd className="font-mono">
                      {preview.width} × {preview.height} px
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-ink-muted">{tc('size')}</dt>
                    <dd className="font-mono">{formatBytes(preview.size, locale)}</dd>
                  </div>
                </dl>
              </Well>

              {converted && (
                <>
                  {requestedFormat && converted.format !== requestedFormat && (
                    <Alert tone="warning">
                      {t('formatFallback', {
                        requested: FORMAT_NAMES[requestedFormat],
                        actual: FORMAT_NAMES[converted.format],
                      })}
                    </Alert>
                  )}
                  {reduction > 0 && (
                    <Alert tone="success" title={t('reducedBy', { percent: reduction })}>
                      {formatBytes(baseSize, locale)} → {formatBytes(converted.size, locale)}
                    </Alert>
                  )}
                  <Button onClick={() => downloadImage(converted, original.name)} className="w-full">
                    <Download size={16} />
                    {t('downloadAs', { format: FORMAT_NAMES[converted.format] })}
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">{t('features')}</CardTitle>
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          {ABOUT_TOPICS.map(topic => (
            <div key={topic}>
              <dt className="mb-1 font-medium text-ink">{t(`about.${topic}.title`)}</dt>
              <dd className="text-ink-muted">{t(`about.${topic}.description`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>

      <Modal open={cropSource !== null} onClose={closeCrop} label={t('cropImage')} title={t('cropImage')} size="lg">
        {cropSource && cropArea ? (
          <>
            <p className="mb-3 font-mono text-sm text-ink-muted">{t('cropSize', { width: cropArea.width, height: cropArea.height })}</p>

            <div className="flex items-center justify-center">
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} className="checkerboard">
                <img src={cropSource.dataUrl} alt={tc('preview')} className="max-h-[60vh] max-w-full" />
              </ReactCrop>
            </div>

            {errorMessage && <Alert className="mt-4">{errorMessage}</Alert>}

            <div className="mt-4 flex gap-2">
              <Button
                onClick={applyCrop}
                className="flex-1"
                disabled={loading || cropArea.width < 1 || cropArea.height < 1}
              >
                {loading ? t('cropping') : t('applyCrop')}
              </Button>
              <Button onClick={closeCrop} variant="outline" className="flex-1">
                {tc('cancel')}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </ToolLayout>
  );
}
