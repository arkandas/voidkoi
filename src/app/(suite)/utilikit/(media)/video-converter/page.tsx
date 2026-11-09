'use client';

import { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Check, Clock, Download, Video, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { appendTrim, evaluateTrim, NO_TRIM, TrimFields, type TrimValues } from '@/modules/utilikit/components/trim-fields';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Progress } from '@/modules/utilikit/components/ui/progress';
import { Well } from '@/modules/utilikit/components/ui/well';
import { downloadFilename } from '@/modules/utilikit/lib/download-filename';
import { formatBytes, formatDuration } from '@/lib/format';
import { formatPercentChange } from '@/modules/utilikit/lib/format';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { cn } from '@/lib/cn';
import {
  GIF_FRAME_RATES,
  MAX_GIF_SECONDS,
  VIDEO_CODECS,
  VIDEO_PRESETS,
  type GifFrameRate,
  type VideoPreset,
} from '@/modules/utilikit/lib/video-convert';
import { Alert, Button, Card, CardTitle, Input, Segmented, Spinner } from '@/components/ui';

const API = '/api/utilikit/video-convert';
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const ACCEPT = 'video/*,.mp4,.webm,.avi,.mov,.mkv';
const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/avi',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
]);
const VIDEO_EXTENSION = /\.(mp4|webm|avi|mov|mkv)$/i;
const FORMATS = ['mp4-h264', 'mp4-h265', 'webm-vp9', 'webm-av1', 'mov', 'mkv', 'gif'] as const;
const RESOLUTIONS = ['original', '1080', '720', '480', '360', 'custom'] as const;
const SIDES = ['width', 'height'] as const;
const QUALITY_PRESETS = [
  { id: 'tiny', value: 25 },
  { id: 'small', value: 50 },
  { id: 'medium', value: 75 },
  { id: 'lossless', value: 100 },
] as const;
const QUALITY_TICKS = [0.1, 0.5, 1];
const TIPS = ['trim', 'resolution', 'quality', 'lossless', 'bitrate', 'preset', 'audio', 'h264', 'h265', 'vp9', 'av1', 'gif', 'general'] as const;
const POLL_INTERVAL = 1000;
const FILE_LIFETIME = 5 * 60 * 1000;

type Format = (typeof FORMATS)[number];
type Resolution = (typeof RESOLUTIONS)[number];

const FORMAT_LABELS: Record<Format, string> = {
  'mp4-h264': 'MP4 (H.264)',
  'mp4-h265': 'MP4 (H.265)',
  'webm-vp9': 'WebM (VP9)',
  'webm-av1': 'WebM (AV1)',
  mov: 'MOV',
  mkv: 'MKV',
  gif: 'GIF',
};

interface Size {
  width: number;
  height: number;
}

interface Metadata extends Size {
  duration: number;
}

type Job =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; progress: number }
  | { status: 'completed'; outputSize: number; expiresAt: number }
  | { status: 'failed'; error: string; detail?: string };

interface JobStatus {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  detail?: string;
  outputSize?: number;
}

async function fetchJobStatus(jobId: string): Promise<JobStatus | null> {
  try {
    const response = await fetch(`${API}?jobId=${encodeURIComponent(jobId)}`);
    return response.ok ? await response.json() : { status: 'failed', error: await readErrorCode(response) };
  } catch (error) {
    console.error('Status check error:', error);
    return null;
  }
}

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded - (rounded % 2);
}

function outputSize(source: Size, resolution: Resolution, custom: Size): Size {
  if (resolution === 'custom') {
    return { width: even(Math.min(custom.width, source.width)), height: even(Math.min(custom.height, source.height)) };
  }

  const scale = resolution === 'original' ? 1 : Math.min(1, Number(resolution) / Math.min(source.width, source.height));
  return { width: even(source.width * scale), height: even(source.height * scale) };
}

function formatSize({ width, height }: Size): string {
  return `${width}×${height}`;
}

function qualityLevel(quality: number) {
  if (quality === 100) return 'lossless';
  if (quality >= 80) return 'high';
  if (quality >= 60) return 'medium';
  if (quality >= 40) return 'low';
  return 'veryLow';
}

export default function VideoConverter() {
  const t = useTranslations('utilikit.videoConverter');
  const tc = useTranslations('utilikit.common');
  const tTrim = useTranslations('utilikit.trim');
  const videoRef = useRef<HTMLVideoElement>(null);
  const locale = useLocale();
  const apiError = useErrorMessage();

  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('mp4-h264');
  const [resolution, setResolution] = useState<Resolution>('original');
  const [custom, setCustom] = useState<Size>({ width: 1920, height: 1080 });
  const [quality, setQuality] = useState(75);
  const [preset, setPreset] = useState<VideoPreset>('slower');
  const [keepAudio, setKeepAudio] = useState(true);
  const [trim, setTrim] = useState<TrimValues>(NO_TRIM);
  const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(15);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job>({ status: 'idle' });
  const [now, setNow] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const progress = job.status === 'processing' ? job.progress : 0;
  const phase =
    job.status === 'uploading' ? 'uploading' : progress < 10 ? 'starting' : progress < 99 ? 'converting' : 'finalizing';
  const secondsLeft = job.status === 'completed' ? Math.max(0, Math.ceil((job.expiresAt - now) / 1000)) : 0;
  const counting = secondsLeft > 0;
  const inputSize = video?.file.size ?? 0;
  const extension = video?.file.name.match(/\.([^.]+)$/)?.[1].toUpperCase();
  const percent = new Intl.NumberFormat(locale, { style: 'percent' });
  const isGif = format === 'gif';
  const trimResult = evaluateTrim(trim, metadata?.duration ?? null);
  const clipLength = trimResult.ok ? (trimResult.trim?.duration ?? metadata?.duration ?? 0) : 0;
  const gifTooLong = isGif && clipLength > MAX_GIF_SECONDS;

  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const status = await fetchJobStatus(jobId);
      if (!active) return;

      if (status?.status === 'completed') {
        const completedAt = Date.now();
        setNow(completedAt);
        setJob({ status: 'completed', outputSize: status.outputSize ?? 0, expiresAt: completedAt + FILE_LIFETIME });
      } else if (status?.status === 'failed') {
        setJob({ status: 'failed', error: status.error ?? 'conversionFailed', detail: status.detail });
      } else {
        if (status) setJob({ status: 'processing', progress: status.progress ?? 0 });
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!counting) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [counting]);

  const handleFiles = ([selected]: File[]) => {
    if (!VIDEO_TYPES.has(selected.type) && !VIDEO_EXTENSION.test(selected.name)) {
      setFileError(t('errors.invalidFile'));
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setFileError(
        t('errors.fileTooLarge', { size: formatBytes(selected.size, locale), max: formatBytes(MAX_FILE_SIZE, locale) })
      );
      return;
    }

    setFileError(null);
    setMetadata(null);
    setVideo({ file: selected, url: URL.createObjectURL(selected) });
  };

  const changeFormat = (id: Format) => {
    setFormat(id);
    if (id === 'gif' && resolution === 'original') setResolution('480');
  };

  const changeResolution = (id: Resolution) => {
    setResolution(id);
    if (id === 'custom' && metadata) setCustom({ width: metadata.width, height: metadata.height });
  };

  const changeCustom = (side: keyof Size, value: string) => {
    if (!metadata) return;
    const length = Math.max(1, Math.min(parseInt(value, 10) || 1, metadata[side]));
    const ratio = metadata.width / metadata.height;

    setCustom(
      side === 'width'
        ? { width: length, height: Math.max(1, Math.round(length / ratio)) }
        : { width: Math.max(1, Math.round(length * ratio)), height: length }
    );
  };

  const handleConvert = async () => {
    if (!video) return;
    setJob({ status: 'uploading' });
    setSaveError(null);

    const params = new URLSearchParams({ name: video.file.name, format, quality: String(quality), resolution });
    if (resolution === 'custom') {
      params.append('customWidth', String(custom.width));
      params.append('customHeight', String(custom.height));
    }
    params.append('preset', preset);
    params.append('keepAudio', String(keepAudio));
    params.append('gifFrameRate', String(gifFrameRate));
    appendTrim(params, trimResult);

    try {
      const response = await fetch(`${API}?${params}`, { method: 'POST', body: video.file });

      if (!response.ok) {
        setJob({ status: 'failed', error: await readErrorCode(response) });
        return;
      }

      const data: { jobId: string } = await response.json();
      setJob({ status: 'processing', progress: 0 });
      setJobId(data.jobId);
    } catch (error) {
      console.error('Upload error:', error);
      setJob({ status: 'failed', error: 'uploadFailed' });
    }
  };

  const handleSave = async () => {
    if (!jobId || !video) return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${API}/download?jobId=${encodeURIComponent(jobId)}`);

      if (!response.ok) {
        setSaveError(await readErrorCode(response));
        return;
      }

      const baseName = video.file.name.replace(/\.[^.]+$/, '') || 'video';
      const fallback = `${baseName}.${VIDEO_CODECS[format].extension}`;
      saveAs(await response.blob(), downloadFilename(response.headers.get('Content-Disposition'), fallback));
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('downloadFailed');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = () => {
    setJobId(null);
    setJob({ status: 'idle' });
    setSaveError(null);
  };

  const handleReset = () => {
    handleRetry();
    setVideo(null);
    setMetadata(null);
    setFileError(null);
    setResolution('original');
    setTrim(NO_TRIM);
  };

  const resolutionLabel = (id: Resolution) =>
    id === 'original' || id === 'custom' ? t(`resolutions.${id}`) : `${id}p`;

  const resolutionHint = (id: Resolution) => {
    if (id === 'custom') return t('resolutionHints.custom');
    if (metadata) return formatSize(outputSize(metadata, id, custom));
    return id === 'original' ? t('resolutionHints.original') : t('resolutionHints.preset', { size: id });
  };

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        {job.status === 'idle' && !video && (
          <Card>
            <Dropzone
              onFiles={handleFiles}
              title={t('upload.title')}
              hint={t('upload.hint', { max: formatBytes(MAX_FILE_SIZE, locale) })}
              accept={ACCEPT}
            />
            {fileError && <Alert className="mt-4">{fileError}</Alert>}
          </Card>
        )}

        {job.status === 'idle' && video && (
          <>
            <Card>
              <CardTitle className="wrap-anywhere">{video.file.name}</CardTitle>
              {extension && <p className="mt-1 text-sm text-ink-muted">{t('originalFormat', { format: extension })}</p>}
              <video
                ref={videoRef}
                src={video.url}
                controls
                onLoadedMetadata={event => {
                  const { duration, videoWidth, videoHeight } = event.currentTarget;
                  if (videoWidth > 0 && videoHeight > 0) setMetadata({ duration, width: videoWidth, height: videoHeight });
                }}
                className="mt-4 max-h-100 w-full rounded-lg border border-line bg-canvas"
              />
              {metadata && (
                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Stat label={t('resolution')} value={formatSize(metadata)} />
                  <Stat label={tc('duration')} value={formatDuration(metadata.duration)} />
                  <Stat label={tc('size')} value={formatBytes(video.file.size, locale)} />
                </dl>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <CardTitle>{t('settings')}</CardTitle>
                <Button
                  onClick={handleReset}
                  variant="ghost"
                  size="sm"
                  aria-label={t('removeVideo')}
                  title={t('removeVideo')}
                >
                  <X size={16} />
                </Button>
              </div>

              <div className="space-y-6">
                <div>
                  <Label>{tTrim('title')}</Label>
                  <TrimFields value={trim} onChange={setTrim} duration={metadata?.duration ?? null} media={metadata ? videoRef : undefined} />
                </div>

                <div>
                  <Label>{t('format')}</Label>
                  <div role="group" aria-label={t('format')} className="grid grid-cols-2 gap-2 sm:gap-3">
                    {FORMATS.map(id => (
                      <Choice
                        key={id}
                        active={format === id}
                        label={FORMAT_LABELS[id]}
                        hint={t(`formats.${id}`)}
                        onClick={() => changeFormat(id)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <Label>{t('outputResolution')}</Label>
                  <div
                    role="group"
                    aria-label={t('outputResolution')}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
                  >
                    {RESOLUTIONS.map(id => (
                      <Choice
                        key={id}
                        active={resolution === id}
                        label={resolutionLabel(id)}
                        hint={resolutionHint(id)}
                        disabled={id === 'custom' && !metadata}
                        onClick={() => changeResolution(id)}
                      />
                    ))}
                  </div>

                  {resolution === 'custom' && metadata && (
                    <div className="mt-4 space-y-3 rounded-lg border border-line bg-canvas p-4">
                      <p className="text-sm text-ink-muted">{t('custom.info')}</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {SIDES.map(side => (
                          <Input
                            key={side}
                            type="number"
                            min={1}
                            max={metadata[side]}
                            value={custom[side]}
                            onChange={e => changeCustom(side, e.target.value)}
                            label={t(`custom.${side}`, { max: String(metadata[side]) })}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-ink-muted">
                        {t('custom.output', {
                          size: formatSize(outputSize(metadata, 'custom', custom)),
                          ratio: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                            metadata.width / metadata.height
                          ),
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {isGif ? (
                  <div className="space-y-3">
                    <div>
                      <Label>{t('frameRate')}</Label>
                      <Segmented
                        value={String(gifFrameRate)}
                        onChange={value => setGifFrameRate(Number(value) as GifFrameRate)}
                        options={GIF_FRAME_RATES.map(rate => ({ value: String(rate), label: t('fps', { value: rate }) }))}
                        ariaLabel={t('frameRate')}
                      />
                    </div>
                    {gifTooLong ? (
                      <Alert tone="warning">{t('gifTooLong', { max: MAX_GIF_SECONDS })}</Alert>
                    ) : (
                      <p className="text-xs text-ink-muted">{t('gifNote', { max: MAX_GIF_SECONDS })}</p>
                    )}
                  </div>
                ) : (
                  <>
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Label htmlFor="video-quality" className="mb-0">
                        {quality === 100 ? t('qualityLossless', { value: 1 }) : t('quality', { value: quality / 100 })}
                      </Label>
                      <span className="text-sm text-ink-muted">{t(`qualityLevels.${qualityLevel(quality)}`)}</span>
                    </div>
                    <input
                      id="video-quality"
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={quality}
                      onChange={e => setQuality(Number(e.target.value))}
                      className="range w-full"
                    />
                    <div className="mt-1 mb-3 flex justify-between text-xs text-ink-muted">
                      {QUALITY_TICKS.map(tick => (
                        <span key={tick}>{percent.format(tick)}</span>
                      ))}
                    </div>
                    <Segmented
                      value={String(quality)}
                      onChange={value => setQuality(Number(value))}
                      options={QUALITY_PRESETS.map(({ id, value }) => ({
                        value: String(value),
                        label: t(`qualityPresets.${id}`),
                      }))}
                      ariaLabel={t('qualityPresetsLabel')}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Label className="mb-0">{t('preset')}</Label>
                      <span className="text-sm text-ink-muted">{t(`presets.${preset}.hint`)}</span>
                    </div>
                    <Segmented
                      value={preset}
                      onChange={setPreset}
                      options={VIDEO_PRESETS.map(id => ({ value: id, label: t(`presets.${id}.label`) }))}
                      ariaLabel={t('preset')}
                    />
                    <p className="mt-2 text-xs text-ink-muted">{t('tips.preset.text')}</p>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{t('includeAudio')}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {keepAudio ? t('audioOn') : t('audioOff')}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={keepAudio}
                      onChange={e => setKeepAudio(e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                  </label>
                  </>
                )}

                <Button onClick={handleConvert} className="w-full" size="lg" disabled={!trimResult.ok || gifTooLong}>
                  {t('convert')}
                </Button>
              </div>
            </Card>
          </>
        )}

        {(job.status === 'uploading' || job.status === 'processing') && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
              <Spinner size={40} className="text-accent" />
              <h3 className="text-xl font-semibold text-ink">{t(`phases.${phase}`)}</h3>
              <p className="text-sm text-ink-muted">{t('progress', { value: progress / 100 })}</p>
              <Progress value={progress} label={t(`phases.${phase}`)} className="max-w-md" />
            </div>
          </Card>
        )}

        {job.status === 'completed' && (
          <Card>
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-semibold text-ink">{t('completed.title')}</h3>
              <p className="text-ink-muted">{t('completed.message')}</p>
              {counting ? (
                <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
                  <Clock size={16} className="shrink-0" />
                  {t('completed.availableFor', { time: formatDuration(secondsLeft) })}
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
                  <AlertCircle size={16} className="shrink-0" />
                  {t('completed.expired')}
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:gap-4">
              <Stat emphasis label={t('completed.originalSize')} value={formatBytes(inputSize, locale)} />
              <Stat emphasis label={t('completed.convertedSize')} value={formatBytes(job.outputSize, locale)} />
            </dl>

            {job.outputSize > 0 && job.outputSize < inputSize && (
              <p className="mt-4 rounded-lg bg-success-soft px-4 py-2 text-center text-sm font-semibold text-success">
                {t('completed.reducedBy', {
                  amount: formatBytes(inputSize - job.outputSize, locale),
                  percent: formatPercentChange(inputSize, job.outputSize) / 100,
                })}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleSave} size="lg" className="sm:flex-1" disabled={saving || !counting}>
                {saving ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                {tc('download')}
              </Button>
              <Button onClick={handleReset} variant="outline" size="lg">
                {t('completed.another')}
              </Button>
            </div>
          </Card>
        )}

        {job.status === 'completed' && saveError && <Alert>{apiError(saveError)}</Alert>}

        {job.status === 'failed' && (
          <Card className="border-danger/40 bg-danger-soft">
            <div className="flex items-start gap-3">
              <AlertCircle size={24} className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 text-lg font-semibold text-ink">{t('conversionFailed')}</h3>
                <p className="text-sm text-ink-muted">{apiError(job.error)}</p>
                {job.detail && (
                  <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-ink-faint wrap-anywhere">
                    {job.detail}
                  </p>
                )}
                <Button onClick={handleRetry} variant="outline" size="sm" className="mt-4">
                  {tc('tryAgain')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        <GuideCard>
          <CardTitle className="mb-3">
            <Video size={18} className="shrink-0" />
            {t('guide')}
          </CardTitle>
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            {TIPS.map(tip => (
              <div key={tip}>
                <dt className="font-medium text-ink">{t(`tips.${tip}.title`)}</dt>
                <dd className="text-ink-muted">{t(`tips.${tip}.text`)}</dd>
              </div>
            ))}
          </dl>
        </GuideCard>
      </div>
    </ToolLayout>
  );
}

interface ChoiceProps {
  active: boolean;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}

function Choice({ active, label, hint, disabled = false, onClick }: ChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-raised text-ink hover:border-accent'
      )}
    >
      <span className="block font-semibold">{label}</span>
      <span className={cn('mt-0.5 block text-xs', active ? 'text-accent-ink/90' : 'text-ink-muted')}>{hint}</span>
    </button>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <Well className="min-w-0 text-center">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={cn('mt-1 font-semibold wrap-anywhere', emphasis && 'text-lg sm:text-xl')}>{value}</dd>
    </Well>
  );
}
