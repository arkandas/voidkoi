'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CloudDownload, Download, Film, Search, X } from 'lucide-react';
import { FileExpiry, JobFailedCard, JobProgressCard } from '@/modules/utilikit/components/job-status';
import { ToolLayout } from '@/modules/utilikit/components/tool-layout';
import { GuideCard } from '@/modules/utilikit/components/ui/guide-card';
import { Label } from '@/modules/utilikit/components/ui/label';
import { EXTRACT_FORMATS, type ExtractFormat } from '@/modules/utilikit/lib/audio-convert';
import { formatBytes, formatDuration } from '@/lib/format';
import { readErrorCode, useErrorMessage } from '@/modules/utilikit/lib/api-error';
import { useServerJob } from '@/modules/utilikit/lib/use-server-job';
import { cn } from '@/lib/cn';
import { availableQualities, type MediaSummary, type VideoQuality } from '@/modules/utilikit/lib/video-download';
import { Alert, Button, Card, CardTitle, Input, Segmented, Spinner } from '@/components/ui';

const API = '/api/utilikit/video-download';
const FORMAT_LABELS: Record<ExtractFormat, string> = {
  mp3: 'MP3',
  m4a: 'AAC (M4A)',
  opus: 'Opus',
  ogg: 'Ogg Vorbis',
  wav: 'WAV',
};
const FORMAT_OPTIONS = EXTRACT_FORMATS.map(value => ({ value, label: FORMAT_LABELS[value] }));
const TIPS = ['sites', 'quality', 'audio', 'accounts', 'legal', 'responsible'] as const;


export default function VideoDownloader() {
  const t = useTranslations('utilikit.videoDownloader');
  const tc = useTranslations('utilikit.common');
  const locale = useLocale();
  const apiError = useErrorMessage();
  const { job, secondsLeft, available, saving, saveError, start, save, reset } = useServerJob(API);

  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<MediaSummary | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<{ code: string; detail?: string } | null>(null);
  const [item, setItem] = useState(1);
  const [audioOnly, setAudioOnly] = useState(false);
  const [quality, setQuality] = useState<VideoQuality>('best');
  const [audioFormat, setAudioFormat] = useState<ExtractFormat>('mp3');

  const extractAudio = audioOnly || Boolean(info?.audioOnly);
  const qualities = availableQualities(info?.heights ?? []);
  const progress = job.status === 'processing' ? job.progress : 0;
  const phase = progress < 1 ? 'startingDownload' : progress < 99 ? 'downloading' : 'finalizing';
  const result = job.status === 'completed' ? job.result : null;
  const selectedItem = info?.items.find(entry => entry.index === item);

  const lookUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setLookingUp(true);
    setLookupError(null);

    try {
      const response = await fetch(`${API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!response.ok) {
        const body = await response.clone().json().catch(() => null);
        setLookupError({ code: await readErrorCode(response), detail: body?.detail });
        return;
      }
      setInfo(await response.json());
      setItem(1);
      setQuality('best');
    } catch (error) {
      console.error('Lookup error:', error);
      setLookupError({ code: 'fetchFailed' });
    } finally {
      setLookingUp(false);
    }
  };

  const download = () => {
    if (!info) return;
    void start({
      url: info.url,
      item: info.items.length > 1 ? item : undefined,
      audioOnly: extractAudio,
      audioFormat,
      quality: extractAudio ? 'best' : quality,
    });
  };

  const startOver = () => {
    reset();
    setInfo(null);
    setUrl('');
    setLookupError(null);
  };

  const title = String(result?.title ?? selectedItem?.title ?? info?.title ?? 'video');

  return (
    <ToolLayout>
      <div className="space-y-4 sm:space-y-6">
        {job.status === 'idle' && !info && (
          <Card>
            <form onSubmit={lookUp} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Input
                label={t('enterUrl')}
                value={url}
                onChange={event => setUrl(event.target.value)}
                placeholder={t('pasteUrl')}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" disabled={lookingUp || !url.trim()} className="h-11 sm:h-10">
                {lookingUp ? <Spinner size={16} className="text-current" /> : <Search size={16} />}
                {lookingUp ? t('lookingUp') : t('lookUp')}
              </Button>
            </form>
            {lookupError && (
              <Alert className="mt-4" title={t('lookupFailed')}>
                {apiError(lookupError.code)}
                {lookupError.detail && <span className="mt-1 block font-mono text-xs opacity-80 wrap-anywhere">{lookupError.detail}</span>}
              </Alert>
            )}
          </Card>
        )}

        {job.status === 'idle' && info && (
          <Card>
            <div className="flex items-start gap-4">
              {info.thumbnail ? (
                <img
                  src={info.thumbnail}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={event => (event.currentTarget.style.display = 'none')}
                  className="hidden aspect-video w-40 shrink-0 rounded-lg border border-line bg-canvas object-cover sm:block"
                />
              ) : (
                <span className="hidden aspect-video w-40 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-ink-faint sm:flex">
                  <Film size={28} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <CardTitle className="wrap-anywhere">{info.title}</CardTitle>
                <p className="mt-1 text-sm text-ink-muted">
                  {[info.site, info.uploader, info.duration ? formatDuration(info.duration) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button onClick={startOver} variant="ghost" size="sm" aria-label={t('another')} title={t('another')}>
                <X size={16} />
              </Button>
            </div>

            {info.items.length > 1 && (
              <div className="mt-5">
                <Label>{t('items', { count: info.items.length })}</Label>
                <div role="radiogroup" aria-label={t('items', { count: info.items.length })} className="themed-scroll max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {info.items.map(entry => (
                    <button
                      key={entry.index}
                      type="button"
                      role="radio"
                      aria-checked={item === entry.index}
                      onClick={() => setItem(entry.index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border-2 px-2.5 py-2 text-left text-sm transition-colors',
                        item === entry.index ? 'border-accent bg-accent-soft/60' : 'border-line bg-raised hover:border-accent'
                      )}
                    >
                      <span className="w-6 shrink-0 text-right tabular-nums text-ink-faint">{entry.index}</span>
                      {entry.thumbnail && (
                        <img src={entry.thumbnail} alt="" referrerPolicy="no-referrer" className="aspect-video w-16 shrink-0 rounded object-cover" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-ink">{entry.title}</span>
                      {entry.duration && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{formatDuration(entry.duration)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-5">
              {info.audioOnly ? (
                <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink-muted">{t('audioOnlySource')}</p>
              ) : (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-canvas p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{t('audioOnly')}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{t('extractAudioDescription')}</span>
                  </span>
                  <input type="checkbox" checked={audioOnly} onChange={event => setAudioOnly(event.target.checked)} className="h-4 w-4 shrink-0" />
                </label>
              )}

              {extractAudio ? (
                <div>
                  <Label>{t('audioFormat')}</Label>
                  <Segmented value={audioFormat} onChange={setAudioFormat} options={FORMAT_OPTIONS} ariaLabel={t('audioFormat')} />
                </div>
              ) : (
                <div>
                  <Label>{t('videoQuality')}</Label>
                  <Segmented
                    value={qualities.includes(quality) ? quality : 'best'}
                    onChange={setQuality}
                    options={qualities.map(value => ({ value, label: value === 'best' ? t('qualityBest') : `${value}p` }))}
                    ariaLabel={t('videoQuality')}
                  />
                </div>
              )}

              <Button onClick={download} className="w-full" size="lg">
                <CloudDownload size={16} />
                {tc('download')}
              </Button>
            </div>
          </Card>
        )}

        {(job.status === 'uploading' || job.status === 'processing') && <JobProgressCard title={t(phase)} progress={progress} />}

        {result && (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center sm:py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
                <Check size={32} />
              </div>
              <h3 className="text-xl font-semibold text-ink">{t('downloadComplete')}</h3>
              <FileExpiry secondsLeft={secondsLeft} expired={t('fileExpired')} />
              <p className="text-ink-muted wrap-anywhere">{title}</p>
              {Number(result.fileSize) > 0 && (
                <p className="rounded-lg bg-success-soft px-4 py-2 font-medium text-success">{formatBytes(Number(result.fileSize), locale)}</p>
              )}
              <div className="mt-3 flex flex-wrap justify-center gap-3">
                <Button onClick={() => save(`${title}.${extractAudio ? audioFormat : 'mp4'}`)} size="lg" disabled={saving || !available}>
                  {saving ? <Spinner size={16} className="text-current" /> : <Download size={16} />}
                  {t('downloadFile')}
                </Button>
                <Button onClick={startOver} variant="outline" size="lg">
                  {t('tryAnother')}
                </Button>
              </div>
              {saveError && <Alert className="mt-2">{apiError(saveError)}</Alert>}
            </div>
          </Card>
        )}

        {job.status === 'failed' && (
          <JobFailedCard title={t('downloadFailed')} error={job.error} detail={job.detail} onRetry={reset} />
        )}

        <GuideCard>
          <CardTitle className="mb-3">
            <Film size={18} className="shrink-0" />
            {t('usageNotice')}
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
