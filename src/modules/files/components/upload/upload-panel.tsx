'use client';

import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  WifiOff,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import { FileIcon } from '@/modules/files/components/file-icon';
import { FileName } from '@/modules/files/components/file-name';
import { useFilesStatus } from '@/modules/files/components/files-status';
import { Confirm, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes, formatSpeed, roundTimeLeft } from '@/lib/format';
import type { UploadManager, UploadStatus, UploadView } from '@/modules/files/lib/upload/engine';

import { useUploads } from './upload-provider';
import { useApiError } from '@/lib/use-api-error';
import { ApiError } from '@/lib/error-codes';

/** More rows than this and the panel shows a count instead of the rest. */
const MAX_ROWS = 200;

const ORDER: Record<UploadStatus, number> = { uploading: 0, failed: 1, paused: 2, waiting: 3, done: 4 };

function useTimeLeft() {
  const t = useTranslations('files.uploads.left');
  return (seconds: number | null): string | null => {
    const left = seconds === null ? null : roundTimeLeft(seconds);
    if (!left) return null;
    if (left.unit === 'few') return t('few');
    if (left.unit === 'seconds') return t('seconds', { count: left.value });
    if (left.unit === 'minutes') return t('minutes', { count: left.value });
    return t('hours', { hours: left.hours, minutes: left.minutes });
  };
}

/** A ring that fills as the whole batch goes up, with what is happening in the middle. */
function Ring({ progress, children }: { progress: number; children: React.ReactNode }) {
  const radius = 17;
  const length = 2 * Math.PI * radius;
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
          className="ring-fill stroke-accent"
        />
      </svg>
      <span className="relative text-accent">{children}</span>
    </span>
  );
}

function Bar({ value, live, className, tone = 'accent' }: { value: number; live: boolean; className?: string; tone?: 'accent' | 'faint' }) {
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-linear', tone === 'accent' ? 'bg-accent' : 'bg-ink-faint', live && 'sheen')}
        style={{ width: `${Math.max(value > 0 ? 2 : 0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

function Row({ upload, manager, maxUploadBytes }: { upload: UploadView; manager: UploadManager; maxUploadBytes: number | null }) {
  const t = useTranslations('files.uploads');
  const apiError = useApiError();
  const locale = useLocale();
  const timeLeft = useTimeLeft();
  const fraction = upload.size === 0 ? (upload.status === 'done' ? 1 : 0) : upload.sent / upload.size;
  const percent = Math.floor(fraction * 100);
  const size = formatBytes(upload.size, locale);
  const sent = formatBytes(upload.sent, locale);

  let detail: string;
  if (upload.status === 'done') detail = t('row.done', { size, place: upload.destination });
  else if (upload.status === 'failed' && upload.error === 'fileTooLarge' && maxUploadBytes != null)
    detail = t('row.tooLarge', { max: formatBytes(maxUploadBytes, locale) });
  else if (upload.status === 'failed') detail = apiError(upload.error ? new ApiError(upload.error) : null, 'uploadFailed');
  else if (upload.status === 'paused') detail = t('row.paused', { sent, size });
  else if (upload.status === 'waiting') detail = t('row.waiting', { size });
  else {
    const left = upload.speed > 0 ? timeLeft((upload.size - upload.sent) / upload.speed) : null;
    detail = [t('row.progress', { sent, size }), upload.speed > 0 ? formatSpeed(upload.speed, locale) : null, left]
      .filter(Boolean)
      .join(' · ');
  }

  return (
    <li className="upload-row flex items-center gap-3 py-2.5 pr-2 pl-4">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300',
          upload.status === 'done' && 'bg-accent text-accent-ink',
          upload.status === 'failed' && 'bg-danger-soft text-danger',
          upload.status !== 'done' && upload.status !== 'failed' && 'bg-accent-soft text-accent',
          upload.status === 'waiting' && 'opacity-70',
        )}
      >
        {upload.status === 'done' ? (
          <Check size={18} strokeWidth={3} className="pop" />
        ) : upload.status === 'failed' ? (
          <AlertCircle size={18} />
        ) : (
          <FileIcon kind="file" mime={upload.type} name={upload.name} size={18} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <FileName name={upload.name} className={cn('flex-1 text-[13.5px] font-semibold text-ink', upload.status === 'waiting' && 'text-ink-muted')} />
          {upload.status === 'uploading' || upload.status === 'paused' ? (
            <span className="text-xs font-semibold text-accent tabular-nums">{percent}%</span>
          ) : null}
        </div>
        <p className={cn('mt-0.5 truncate text-xs tabular-nums', upload.status === 'failed' ? 'font-medium text-danger' : 'text-ink-muted')}>
          {detail}
        </p>
        {upload.status === 'uploading' || upload.status === 'paused' ? (
          <Bar
            value={fraction}
            live={upload.status === 'uploading'}
            tone={upload.status === 'paused' ? 'faint' : 'accent'}
            className="mt-2"
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center">
        {upload.status === 'failed' && upload.error !== 'fileTooLarge' ? (
          <IconButton size="xs" label={t('retry', { name: upload.name })} icon={<RotateCcw size={15} />} onClick={() => manager.retry(upload.id)} />
        ) : null}
        {upload.status === 'uploading' || upload.status === 'waiting' ? (
          <IconButton size="xs" label={t('pause', { name: upload.name })} icon={<Pause size={15} fill="currentColor" />} onClick={() => manager.pause(upload.id)} />
        ) : null}
        {upload.status === 'paused' ? (
          <IconButton size="xs" label={t('resume', { name: upload.name })} icon={<Play size={15} fill="currentColor" />} onClick={() => manager.resume(upload.id)} />
        ) : null}
        {upload.status !== 'done' ? (
          <IconButton
            size="xs"
            label={upload.status === 'failed' ? t('remove', { name: upload.name }) : t('cancel', { name: upload.name })}
            icon={<X size={16} />}
            onClick={() => manager.cancel(upload.id)}
          />
        ) : null}
      </div>
    </li>
  );
}

export interface UploadPanelProps {
  manager: UploadManager;
  /** The largest file allowed, to say so when one is over it. */
  maxUploadBytes: number | null;
  /** Over the page, above the tab bar on phones; or in its place on the page, as on an upload link's page. */
  floating?: boolean;
  className?: string;
}

/**
 * Every upload in one place: a ring and a bar for the whole batch, with its
 * speed and time left, and each file under it with its own. It stays until
 * it is closed.
 */
export function UploadPanel({ manager, maxUploadBytes, floating = true, className }: UploadPanelProps) {
  const t = useTranslations('files.uploads');
  const locale = useLocale();
  const timeLeft = useTimeLeft();
  const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const { uploads, totals } = snapshot;

  if (uploads.length === 0) return null;

  const progress = totals.bytes === 0 ? (totals.done > 0 ? 1 : 0) : totals.sent / totals.bytes;
  const finished = totals.active === 0 && totals.paused === 0;
  const allPaused = totals.active === 0 && totals.paused > 0;
  const sent = formatBytes(totals.sent, locale);
  const bytes = formatBytes(totals.bytes, locale);

  let title: string;
  let subtitle: string;
  let left: string | null = null;
  let icon: React.ReactNode;
  if (totals.offline && !finished) {
    title = t('offline');
    subtitle = t('offlineDetail', { sent, size: bytes });
    icon = <WifiOff size={18} />;
  } else if (finished) {
    title = totals.failed > 0 && totals.done === 0
      ? t('allFailed', { count: totals.failed })
      : totals.failed > 0
        ? t('someFailed', { done: totals.done, failed: totals.failed })
        : t('finished', { count: totals.done });
    const seconds = totals.startedAt && totals.finishedAt ? Math.max(1, Math.round((totals.finishedAt - totals.startedAt) / 1000)) : null;
    // Nothing arrived: the rows below say why, and "0 B" would add nothing.
    subtitle = totals.done === 0 ? '' : seconds ? t('finishedDetail', { size: bytes, minutes: Math.floor(seconds / 60), seconds: seconds % 60 }) : bytes;
    icon = totals.failed > 0 ? <AlertCircle size={18} className="text-danger" /> : <Check size={20} strokeWidth={3} className="pop" />;
  } else if (allPaused) {
    title = t('paused');
    subtitle = t('row.paused', { sent, size: bytes });
    icon = <Pause size={16} fill="currentColor" />;
  } else {
    title = t('uploading', { count: totals.active });
    left = timeLeft(totals.remaining) ?? t('calculating');
    subtitle = [t('row.progress', { sent, size: bytes }), totals.speed > 0 ? formatSpeed(totals.speed, locale) : null]
      .filter(Boolean)
      .join(' · ');
    icon = <ArrowUp size={19} strokeWidth={2.6} className="bob" />;
  }

  const sorted = [...uploads].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const shown = sorted.slice(0, MAX_ROWS);

  return (
    <section
      aria-label={t('label')}
      className={cn(
        'overflow-hidden rounded-2xl border border-line bg-card',
        floating
          ? 'upload-panel fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-40 lg:right-6 lg:bottom-6 lg:left-auto lg:w-[28rem]'
          : 'upload-card',
        className,
      )}
    >
      <div className="flex items-center gap-3 py-3 pr-2 pl-3.5">
        <Ring progress={finished ? 1 : progress}>{icon}</Ring>
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="flex items-baseline gap-2">
            <p className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{title}</p>
            {left ? <span className="shrink-0 text-xs font-semibold text-accent tabular-nums">{left}</span> : null}
          </div>
          {subtitle ? <p className="truncate text-[12.5px] text-ink-muted tabular-nums">{subtitle}</p> : null}
        </div>
        {!finished && !allPaused ? (
          <IconButton size="sm" label={t('pauseAll')} icon={<Pause size={16} fill="currentColor" />} onClick={() => manager.pauseAll()} />
        ) : null}
        {allPaused ? (
          <IconButton size="sm" label={t('resumeAll')} icon={<Play size={16} fill="currentColor" />} onClick={() => manager.resumeAll()} />
        ) : null}
        <IconButton
          size="sm"
          label={collapsed ? t('show') : t('hide')}
          aria-expanded={!collapsed}
          icon={<ChevronDown size={18} className={cn('transition-transform duration-200', collapsed && 'rotate-180')} />}
          onClick={() => setCollapsed(value => !value)}
        />
        <IconButton
          size="sm"
          label={finished ? t('close') : t('cancelAll')}
          icon={<X size={18} />}
          onClick={() => (finished ? manager.clear() : setConfirmingCancel(true))}
        />
      </div>

      {!finished ? (
        <Bar value={progress} live={!allPaused && !totals.offline} className="mx-3.5 mb-3 h-1.5" />
      ) : null}

      {collapsed ? null : (
        <ul className="themed-scroll max-h-[min(19rem,40dvh)] overflow-y-auto overscroll-contain border-t border-line py-1">
          {shown.map(upload => (
            <Row key={upload.id} upload={upload} manager={manager} maxUploadBytes={maxUploadBytes} />
          ))}
          {sorted.length > shown.length ? (
            <li className="px-4 py-2 text-xs text-ink-muted">{t('more', { count: sorted.length - shown.length })}</li>
          ) : null}
        </ul>
      )}

      <Confirm
        open={confirmingCancel}
        title={t('cancelAllTitle')}
        confirmLabel={t('cancelAllConfirm')}
        danger
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={() => {
          manager.cancelAll();
          setConfirmingCancel(false);
        }}
      >
        {t('cancelAllBody', { count: totals.active + totals.paused })}
      </Confirm>
    </section>
  );
}

/** The app's panel, over every page. */
export function AppUploadPanel() {
  const { manager } = useUploads();
  const { status } = useFilesStatus();
  return <UploadPanel manager={manager} maxUploadBytes={status?.maxUploadBytes ?? null} />;
}
