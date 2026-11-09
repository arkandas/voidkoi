'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Check, Clock, Download, Music, X } from 'lucide-react';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { appendTrim, evaluateTrim, NO_TRIM, TrimFields, type TrimValues } from '@/modules/utilikit/components/trim-fields';
import { Dropzone } from '@/modules/utilikit/components/ui/dropzone';
import { Label } from '@/modules/utilikit/components/ui/label';
import { Progress } from '@/modules/utilikit/components/ui/progress';
import { Well } from '@/modules/utilikit/components/ui/well';
import { AUDIO_FORMATS, LOUDNESS_TARGET } from '@/modules/utilikit/lib/audio-convert';
import { downloadFilename } from '@/modules/utilikit/lib/download-filename';
import { formatBytes, formatDuration } from '@/lib/format';
import { formatPercentChange } from '@/modules/utilikit/lib/format';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { Alert, Button, Card, CardTitle, Segmented, Spinner } from '@/components/ui';

const API = '/api/utilikit/audio-convert';
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const FORMATS = ['mp3', 'aac', 'opus', 'vorbis', 'flac', 'wav'] as const;
const FORMAT_LABELS: Record<Format, string> = {
  mp3: 'MP3',
  aac: 'AAC (M4A)',
  opus: 'Opus',
  vorbis: 'Ogg Vorbis',
  flac: 'FLAC',
  wav: 'WAV',
};
const FORMAT_OPTIONS = FORMATS.map(value => ({ value, label: FORMAT_LABELS[value] }));
const BITRATE_MARKS = [64, 128, 192, 256, 320];
const POLL_INTERVAL = 500;
const FILE_LIFETIME = 5 * 60 * 1000;

type Format = (typeof FORMATS)[number];

interface SourceInfo {
  duration: number;
  bitrate: number;
  codec: string;
}

interface Analysis {
  file: File;
  info?: SourceInfo;
  error?: string;
}

type Job =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; progress: number }
  | { status: 'completed'; inputSize: number; outputSize: number; expiresAt: number }
  | { status: 'failed'; error: string; detail?: string };

interface JobStatus {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  detail?: string;
  inputSize?: number;
  outputSize?: number;
}

async function analyzeFile(file: File): Promise<Analysis> {
  try {
    const params = new URLSearchParams({ name: file.name });
    const response = await fetch(`/api/utilikit/audio-metadata?${params}`, { method: 'POST', body: file });
    return response.ok ? { file, info: await response.json() } : { file, error: await readErrorCode(response) };
  } catch (error) {
    console.error('Metadata error:', error);
    return { file, error: 'metadataFailed' };
  }
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

export default function AudioConverter() {
  const t = useTranslations('utilikit.audioConverter');
  const tc = useTranslations('utilikit.common');
  const tTrim = useTranslations('utilikit.trim');
  const audioRef = useRef<HTMLAudioElement>(null);
  const locale = useLocale();
  const apiError = useErrorMessage();
  const bitrateId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playable, setPlayable] = useState(true);
  const [trim, setTrim] = useState<TrimValues>(NO_TRIM);
  const [normalize, setNormalize] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [format, setFormat] = useState<Format>('mp3');
  const [bitrate, setBitrate] = useState(192);
  const [matchSourceBitrate, setMatchSourceBitrate] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job>({ status: 'idle' });
  const [now, setNow] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const limit = formatBytes(MAX_FILE_SIZE, locale);
  const source = analysis?.file === file ? analysis : null;
  const trimResult = evaluateTrim(trim, source?.info?.duration ?? null);
  const progress = job.status === 'processing' ? job.progress : 0;
  const phase = job.status === 'uploading' ? t('uploading') : t('converting');
  const secondsLeft = job.status === 'completed' ? Math.max(0, Math.ceil((job.expiresAt - now) / 1000)) : 0;
  const counting = secondsLeft > 0;
  const saved =
    job.status === 'completed' && job.outputSize > 0 ? formatPercentChange(job.inputSize, job.outputSize) : 0;
  const failure =
    job.status === 'failed'
      ? { title: t('conversionFailed'), error: job.error, detail: job.detail }
      : job.status === 'idle' && source?.error
        ? { title: t('cannotProcess'), error: source.error }
        : null;

  useEffect(() => {
    if (!audioUrl) return;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (!file) return;
    let active = true;

    const analyze = async () => {
      const result = await analyzeFile(file);
      if (active) setAnalysis(result);
    };

    analyze();

    return () => {
      active = false;
    };
  }, [file]);

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
        setJob({
          status: 'completed',
          inputSize: status.inputSize ?? 0,
          outputSize: status.outputSize ?? 0,
          expiresAt: completedAt + FILE_LIFETIME,
        });
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

  const handleFile = ([selected]: File[]) => {
    if (selected.size > MAX_FILE_SIZE) {
      setFileError(t('errors.fileTooLarge', { size: formatBytes(selected.size, locale), limit }));
      return;
    }

    setFileError(null);
    setFile(selected);
    setAudioUrl(URL.createObjectURL(selected));
    setPlayable(true);
    setTrim(NO_TRIM);
  };

  const handleConvert = async () => {
    if (!file) return;
    setJob({ status: 'uploading' });
    setSaveError(null);

    const params = new URLSearchParams({
      name: file.name,
      format,
      bitrate: String(bitrate),
      matchSourceBitrate: String(matchSourceBitrate),
      normalize: String(normalize),
    });
    appendTrim(params, trimResult);

    try {
      const response = await fetch(`${API}?${params}`, { method: 'POST', body: file });

      if (!response.ok) {
        setJob({ status: 'failed', error: await readErrorCode(response) });
        return;
      }

      const data: { jobId: string } = await response.json();
      setJob({ status: 'processing', progress: 0 });
      setJobId(data.jobId);
    } catch (error) {
      console.error('Conversion error:', error);
      setJob({ status: 'failed', error: 'uploadFailed' });
    }
  };

  const handleSave = async () => {
    if (!jobId || job.status !== 'completed') return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`${API}/download?jobId=${encodeURIComponent(jobId)}`);

      if (!response.ok) {
        setSaveError(await readErrorCode(response));
        return;
      }

      const fallback = `converted.${AUDIO_FORMATS[format].extension}`;
      saveAs(await response.blob(), downloadFilename(response.headers.get('Content-Disposition'), fallback));
    } catch (error) {
      console.error('Save error:', error);
      setSaveError('downloadFailed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setJobId(null);
    setJob({ status: 'idle' });
    setSaveError(null);
  };

  const handleReset = () => {
    handleEdit();
    setFile(null);
    setAudioUrl(null);
    setTrim(NO_TRIM);
  };

  return (
    <ToolLayout>
      {!file && (
        <Card>
          <Dropzone
            onFiles={handleFile}
            title={t('dropAudio')}
            hint={t('supportedFormats', { limit })}
            accept="audio/*,video/*"
          />
          {fileError && <Alert className="mt-4">{fileError}</Alert>}
        </Card>
      )}

      {file && job.status === 'idle' && !failure && (
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-semibold text-ink">{file.name}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatBytes(file.size, locale)}
                  {source?.info?.duration ? ` · ${formatDuration(source.info.duration)}` : null}
                </p>
              </div>
              <Button onClick={handleReset} variant="ghost" size="sm" aria-label={t('removeFile')} title={t('removeFile')}>
                <X size={16} />
              </Button>
            </div>
            {audioUrl && playable && (
              <audio ref={audioRef} src={audioUrl} controls onError={() => setPlayable(false)} className="mt-4 w-full" />
            )}
          </Card>

          <Card>
            <CardTitle className="mb-4">{t('conversionSettings')}</CardTitle>
            <div className="space-y-5">
              <div>
                <Label>{t('outputFormat')}</Label>
                <Segmented value={format} onChange={setFormat} options={FORMAT_OPTIONS} ariaLabel={t('outputFormat')} />
              </div>

              {AUDIO_FORMATS[format].lossy && (
                <>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{t('useSourceBitrate')}</span>
                      {source?.info?.codec && (
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {source.info.bitrate > 0 ? `${source.info.codec} · ${source.info.bitrate} kbps` : source.info.codec}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={matchSourceBitrate}
                      onChange={e => setMatchSourceBitrate(e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                  </label>

                  {!matchSourceBitrate && (
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <Label htmlFor={bitrateId}>{t('outputBitrate')}</Label>
                        <span className="font-mono text-sm font-semibold text-ink">{bitrate} kbps</span>
                      </div>
                      <input
                        id={bitrateId}
                        type="range"
                        min={64}
                        max={320}
                        step={32}
                        value={bitrate}
                        onChange={e => setBitrate(Number(e.target.value))}
                        className="range"
                      />
                      <div className="mt-2 flex justify-between text-xs text-ink-muted">
                        {BITRATE_MARKS.map(mark => (
                          <span key={mark}>{mark}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <Label>{tTrim('title')}</Label>
                <TrimFields
                  value={trim}
                  onChange={setTrim}
                  duration={source?.info?.duration ?? null}
                  media={audioUrl && playable ? audioRef : undefined}
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{t('normalize')}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {t('normalizeDescription', { target: LOUDNESS_TARGET.integrated })}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={normalize}
                  onChange={e => setNormalize(e.target.checked)}
                  className="h-4 w-4 shrink-0"
                />
              </label>
            </div>

            <Button onClick={handleConvert} className="mt-6 w-full" size="lg" disabled={!trimResult.ok}>
              <Music size={16} />
              {tc('convert')}
            </Button>
          </Card>
        </div>
      )}

      {(job.status === 'uploading' || job.status === 'processing') && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <Spinner size={40} className="text-accent" />
            <h3 className="text-xl font-semibold text-ink">{phase}</h3>
            <p className="text-sm text-ink-muted">
              {progress > 0 ? t('progress', { value: progress / 100 }) : t('pleaseWait')}
            </p>
            <Progress value={progress} label={phase} className="max-w-md" />
          </div>
        </Card>
      )}

      {job.status === 'completed' && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
              <Check size={32} />
            </div>
            <h3 className="text-xl font-semibold text-ink">{t('conversionComplete')}</h3>
            {counting ? (
              <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
                <Clock size={16} className="shrink-0" />
                {t('fileAvailable', { time: formatDuration(secondsLeft) })}
              </p>
            ) : (
              <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
                <AlertCircle size={16} className="shrink-0" />
                {t('fileExpired')}
              </p>
            )}
            {job.outputSize > 0 && (
              <dl className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
                {(
                  [
                    ['originalSize', job.inputSize],
                    ['convertedSize', job.outputSize],
                  ] as const
                ).map(([key, size]) => (
                  <Well key={key}>
                    <dt className="text-xs text-ink-muted">{t(key)}</dt>
                    <dd className="mt-1 text-lg font-semibold">{formatBytes(size, locale)}</dd>
                  </Well>
                ))}
              </dl>
            )}
            {saved > 0 && (
              <p className="rounded-lg bg-success-soft px-4 py-2 text-sm font-medium text-success">
                {t('smaller', { value: saved / 100 })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              <Button onClick={handleSave} size="lg" disabled={saving || !counting}>
                {saving ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                {t('downloadAudio')}
              </Button>
              <Button onClick={handleReset} variant="outline" size="lg">
                {t('convertAnother')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {job.status === 'completed' && saveError && <Alert className="mt-4 sm:mt-6">{apiError(saveError)}</Alert>}

      {failure && (
        <Card className="border-danger/40">
          <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-semibold text-ink">{failure.title}</h3>
            <p className="text-ink-muted">{apiError(failure.error)}</p>
            {failure.detail && <p className="max-w-xl font-mono text-xs text-ink-faint wrap-anywhere">{failure.detail}</p>}
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              {job.status === 'failed' && (
                <Button onClick={handleEdit} variant="outline">
                  {t('changeSettings')}
                </Button>
              )}
              <Button onClick={handleReset} variant="outline">
                {t('tryAnotherFile')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <GuideCard className="mt-4 sm:mt-6">
        <CardTitle className="mb-3">
          <Music size={18} className="shrink-0" />
          {t('audioFormatsGuide')}
        </CardTitle>
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          {FORMATS.map(value => (
            <div key={value}>
              <dt className="font-medium text-ink">{FORMAT_LABELS[value]}</dt>
              <dd className="text-ink-muted">{t(`about.${value}`)}</dd>
            </div>
          ))}
        </dl>
      </GuideCard>
    </ToolLayout>
  );
}
