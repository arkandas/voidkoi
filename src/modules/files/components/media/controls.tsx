'use client';

import { useEffect, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import type { MediaInfoDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';

/** "1:05", or "1:02:05" past an hour. "--:--" when unknown. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const infos = new Map<string, Promise<MediaInfoDto | null>>();

/** What the server knows about a video or audio file: undefined while asking (or with no address), null when it couldn't say. */
export function useMediaInfo(url: string): MediaInfoDto | null | undefined {
  const [info, setInfo] = useState<{ url: string; value: MediaInfoDto | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    let current = true;
    let request = infos.get(url);
    if (!request) {
      request = fetch(url)
        .then(response => (response.ok ? (response.json() as Promise<MediaInfoDto>) : null))
        .catch(() => null);
      infos.set(url, request);
    }
    void request.then(value => {
      if (current) setInfo({ url, value });
    });
    return () => {
      current = false;
    };
  }, [url]);

  return url && info?.url === url ? info.value : undefined;
}

/** The volume both players start at, kept between visits. */
export function storedVolume(): number {
  try {
    const value = Number(localStorage.getItem('files-volume'));
    return Number.isFinite(value) && value >= 0 && value <= 1 && localStorage.getItem('files-volume') !== null ? value : 1;
  } catch {
    return 1;
  }
}

export function storeVolume(volume: number): void {
  try {
    localStorage.setItem('files-volume', String(volume));
  } catch {
    // Private windows may refuse: the volume just isn't kept.
  }
}

/** A round button for the players: on the dark stage, or on the app's own colours. */
export function PlayerButton({
  label,
  tone = 'stage',
  large = false,
  className,
  children,
  ...props
}: ComponentPropsWithRef<'button'> & { label: string; tone?: 'stage' | 'app'; large?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full transition-colors focus:outline-hidden disabled:pointer-events-none disabled:opacity-40',
        large ? 'size-14' : 'size-10',
        tone === 'stage'
          ? 'text-stage-ink hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50'
          : 'text-ink hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent/40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Where a video or song is, with what has loaded behind it. Drag or click to
 * go somewhere; the arrow keys step five seconds.
 */
export function SeekBar({
  time,
  duration,
  buffered = 0,
  onSeek,
  label,
  tone = 'stage',
  className,
}: {
  time: number;
  duration: number | null;
  buffered?: number;
  onSeek(seconds: number): void;
  label: string;
  tone?: 'stage' | 'app';
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const total = duration && Number.isFinite(duration) && duration > 0 ? duration : 0;
  const shown = dragging ?? time;
  const fraction = total ? Math.min(1, Math.max(0, shown / total)) : 0;
  const loaded = total ? Math.min(1, Math.max(0, buffered / total)) : 0;
  const clamp = (seconds: number) => Math.min(total, Math.max(0, seconds));

  const at = (clientX: number): number => {
    const rect = track.current!.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * total);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!total || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(at(event.clientX));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    const seconds = at(event.clientX);
    setDragging(null);
    onSeek(seconds);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!total) return;
    const steps: Record<string, number> = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -30, PageUp: 30 };
    let target: number | null = null;
    if (event.key in steps) target = clamp(time + steps[event.key]!);
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = total;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSeek(target);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={total ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} / ${formatTime(total || null)}`}
      aria-disabled={!total}
      onPointerDown={onPointerDown}
      onPointerMove={event => {
        if (dragging !== null) setDragging(at(event.clientX));
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragging(null)}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-5 touch-none items-center focus:outline-hidden',
        total ? 'cursor-pointer' : 'cursor-default opacity-60',
        tone === 'stage' ? 'focus-visible:ring-2 focus-visible:ring-white/40' : 'focus-visible:ring-2 focus-visible:ring-accent/40',
        'rounded-full',
        className,
      )}
    >
      <div
        className={cn(
          'relative h-1 w-full overflow-hidden rounded-full transition-[height] duration-150 group-hover:h-1.5',
          dragging !== null && 'h-1.5',
          tone === 'stage' ? 'bg-white/20' : 'bg-muted dark:bg-line',
        )}
      >
        <div className={cn('absolute inset-y-0 left-0', tone === 'stage' ? 'bg-white/30' : 'bg-line-strong/70')} style={{ width: `${loaded * 100}%` }} />
        <div className={cn('absolute inset-y-0 left-0', tone === 'stage' ? 'bg-white' : 'bg-accent')} style={{ width: `${fraction * 100}%` }} />
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full shadow transition-opacity duration-150',
          tone === 'stage' ? 'bg-white' : 'bg-accent',
          dragging !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
        style={{ left: `${fraction * 100}%` }}
      />
    </div>
  );
}
