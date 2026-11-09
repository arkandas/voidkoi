'use client';

import {
  Download,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import type { ViewerSource } from '@/modules/files/components/viewer';
import { Button } from '@/components/ui';
import { download } from '@/modules/files/lib/api';
import type { ItemDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { playsDirectly } from '@/lib/file-types';

import { useAudioPlayer } from './audio-player';
import { formatTime, PlayerButton, SeekBar, storeVolume, storedVolume, useMediaInfo } from './controls';
import { canFeed, feed, feedsFirst } from './feed';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const STEP = 10;

type PipVideo = HTMLVideoElement & {
  webkitSetPresentationMode?: (mode: string) => void;
  webkitEnterFullscreen?: () => void;
};

function pipSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return document.pictureInPictureEnabled === true || 'webkitSetPresentationMode' in HTMLVideoElement.prototype;
}

/**
 * A video with its own controls, the same in every browser. What the browser
 * can't play itself plays through the server, converted as it goes: a seek
 * there starts the stream again at that point, unless that part has loaded
 * already. Safari is fed the stream piece by piece, as it won't play it from
 * its address. `compact` is the smaller one at the top of a link's page,
 * which waits to be played.
 */
export function VideoPlayer({ item, source, compact = false }: { item: ItemDto; source: ViewerSource; compact?: boolean }) {
  const t = useTranslations('files.player');
  const info = useMediaInfo(source.media(item));
  const music = useAudioPlayer();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Whether to play once the stream (re)starts. */
  const resume = useRef<{ play: boolean } | null>(compact ? null : { play: true });

  const [streaming, setStreaming] = useState(!playsDirectly(item.mime));
  /** How a stream reaches the browser: from its address, or fed piece by piece. */
  const [delivery, setDelivery] = useState<'address' | 'fed'>(() => (feedsFirst() ? 'fed' : 'address'));
  const [offset, setOffset] = useState(0);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [volume, setVolume] = useState(storedVolume);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [canPip] = useState(pipSupported);
  /** Width over height, from the video itself once it loads. */
  const [shape, setShape] = useState<number | null>(null);

  const src = streaming ? source.stream(item, offset) : source.content(item);
  const fed = streaming && delivery === 'fed';
  const feedable = canFeed(info?.stream);
  const duration = streaming ? (info?.duration ?? null) : (length ?? info?.duration ?? null);
  const ratio = shape ?? (info?.video?.width && info.video.height ? info.video.width / info.video.height : 16 / 9);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    // In the viewer the keyboard is the video's: space plays and pauses. After the viewer has placed its own focus.
    const focus = compact ? undefined : setTimeout(() => box.current?.focus({ preventScroll: true }), 0);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      clearTimeout(idleTimer.current);
      clearTimeout(focus);
    };
  }, [compact]);

  // The stream fed piece by piece, once the server has said what it is.
  useEffect(() => {
    const element = video.current;
    const type = info?.stream;
    if (!fed || !element || !type || !feedable) return;
    const stop = new AbortController();
    feed(element, src, type, stop.signal).catch(() => {
      if (!stop.signal.aborted) setFailed(true);
    });
    return () => stop.abort();
  }, [fed, feedable, src, info?.stream]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = volume;
    element.muted = muted;
    element.playbackRate = rate;
  }, [volume, muted, rate, src, delivery]);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }, []);

  /** A new stream from `seconds`, playing on if it was. */
  const restream = useCallback((seconds: number, play: boolean) => {
    resume.current = { play };
    setTime(seconds);
    setBuffered(seconds);
    setOffset(seconds);
    setWaiting(true);
  }, []);

  const toggle = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (element.ended && streaming && offset > 0) restream(0, true);
    else if (element.paused || element.ended) void element.play().catch(() => {});
    else element.pause();
  }, [streaming, offset, restream]);

  const seek = useCallback(
    (seconds: number) => {
      const element = video.current;
      if (!element) return;
      const target = Math.round(Math.max(0, duration ? Math.min(seconds, duration - 0.5) : seconds) * 10) / 10;
      if (!streaming) {
        element.currentTime = target;
        return;
      }
      // A fed stream keeps what has loaded: a seek inside it needs no new stream.
      const at = target - offset;
      const ranges = element.buffered;
      for (let index = 0; fed && index < ranges.length; index++) {
        if (at >= ranges.start(index) && at <= ranges.end(index) - 0.5) {
          element.currentTime = at;
          return;
        }
      }
      if (target === offset) element.currentTime = 0;
      else restream(target, !element.paused);
    },
    [duration, streaming, fed, offset, restream],
  );

  const toggleFullscreen = () => {
    const element = box.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (element.requestFullscreen) void element.requestFullscreen().catch(() => {});
    else (video.current as PipVideo | null)?.webkitEnterFullscreen?.();
  };

  const togglePip = () => {
    const element = video.current as PipVideo | null;
    if (!element) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else if (element.requestPictureInPicture) void element.requestPictureInPicture().catch(() => {});
    else element.webkitSetPresentationMode?.('picture-in-picture');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = (event.target as HTMLElement).tagName;
    // A focused button keeps space and enter; the volume keeps its arrows.
    if (target === 'INPUT' || (target === 'BUTTON' && (event.key === ' ' || event.key === 'Enter'))) return;
    const keys: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      j: () => seek(time - STEP),
      l: () => seek(time + STEP),
      ArrowLeft: () => seek(time - 5),
      ArrowRight: () => seek(time + 5),
      m: () => setMuted(value => !value),
      f: toggleFullscreen,
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    // Not the viewer's: the arrows here move through the video, not to the next file.
    event.stopPropagation();
    action();
    wake();
  };

  // The server can't read it either when it says so, or this browser can't be fed it: nothing will play.
  if (failed || (streaming && info?.playable === false) || (fed && info !== undefined && !feedable)) {
    return (
      <div className={cn('flex flex-col items-center gap-4 text-center text-stage-ink', compact && 'px-6 py-10')}>
        <p className="font-semibold">{t('cantPlay')}</p>
        <Button onClick={() => download(source.content(item, true))} icon={<Download size={16} />}>
          {t('download')}
        </Button>
      </div>
    );
  }

  const hidden = playing && idle;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  // As large as fits, in the video's own shape: the viewer's whole stage, or the width of a link's page.
  const size: CSSProperties = compact
    ? { height: `min(55dvh, ${(100 / ratio).toFixed(3)}cqw)` }
    : { width: `min(100cqw, ${(100 * ratio).toFixed(3)}cqh)`, aspectRatio: String(ratio) };

  return (
    <div className={cn('flex w-full items-center justify-center', compact ? '[container-type:inline-size]' : 'h-full [container-type:size]')}>
      <div
        ref={box}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={wake}
        onPointerDown={wake}
        style={size}
        className={cn(
          '@container/player group/player relative flex items-center justify-center overflow-hidden bg-black focus:outline-hidden [&:fullscreen]:rounded-none',
          compact ? 'w-full' : 'rounded-lg shadow-2xl',
          hidden && 'cursor-none',
        )}
      >
        <video
          key={`${delivery}:${src}`}
          ref={video}
          src={fed ? undefined : src}
          poster={item.hasThumbnail && offset === 0 ? source.thumbnail(item) : undefined}
          playsInline
          preload="metadata"
          onClick={toggle}
          onDoubleClick={toggleFullscreen}
          onLoadedMetadata={event => {
            const element = event.currentTarget;
            if (!streaming && Number.isFinite(element.duration)) setLength(element.duration);
            if (element.videoWidth && element.videoHeight) setShape(element.videoWidth / element.videoHeight);
            if (resume.current?.play) void element.play().catch(() => setWaiting(false));
            else setWaiting(false);
            resume.current = null;
          }}
          onTimeUpdate={event => {
            const element = event.currentTarget;
            setTime(offset + element.currentTime);
            if (fed && element.buffered.length > 0) setBuffered(offset + element.buffered.end(element.buffered.length - 1));
          }}
          onProgress={event => {
            const ranges = event.currentTarget.buffered;
            if (ranges.length > 0) setBuffered(offset + ranges.end(ranges.length - 1));
          }}
          onPlay={() => {
            // One thing playing at a time: the song in the mini player stops.
            music?.pause();
            setPlaying(true);
            wake();
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={() => {
            if (!streaming && info?.playable !== false) {
              // The browser couldn't play the file after all: through the server, from where it was.
              resume.current = { play: true };
              setOffset(Math.floor(time));
              setStreaming(true);
              setWaiting(true);
            } else if (streaming && !fed && info?.playable !== false && canFeed(info?.stream)) {
              // Nor the stream from its address: fed piece by piece instead.
              resume.current = { play: true };
              setDelivery('fed');
              setWaiting(true);
            } else {
              setFailed(true);
            }
          }}
          className="size-full object-contain"
        />

        {waiting ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 size={34} className="animate-spin text-white/80" />
          </span>
        ) : !playing ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={t('play')}
            className="absolute flex size-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform hover:scale-105"
          >
            <Play size={28} fill="currentColor" className="translate-x-0.5" />
          </button>
        ) : null}

        <div
          className={cn(
            'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pt-10 pb-2 text-stage-ink transition-opacity duration-300 sm:px-4',
            hidden ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        >
          <SeekBar time={time} duration={duration} buffered={buffered} onSeek={seek} label={t('seek')} />
          <div className="mt-1 flex items-center gap-1">
            <PlayerButton label={playing ? t('pause') : t('play')} onClick={toggle}>
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-px" />}
            </PlayerButton>
            <PlayerButton label={t('back', { seconds: STEP })} onClick={() => seek(time - STEP)} className="@max-sm/player:hidden">
              <RotateCcw size={18} />
            </PlayerButton>
            <PlayerButton label={t('forward', { seconds: STEP })} onClick={() => seek(time + STEP)} className="@max-sm/player:hidden">
              <RotateCw size={18} />
            </PlayerButton>
            <span className="ml-1 text-[13px] whitespace-nowrap tabular-nums text-stage-ink/90">
              {formatTime(time)} <span className="text-stage-ink-muted">/ {formatTime(duration)}</span>
            </span>

            <span className="flex-1" />

            <span className="group/volume flex items-center">
              <PlayerButton label={muted ? t('unmute') : t('mute')} onClick={() => setMuted(value => !value)}>
                <VolumeIcon size={19} />
              </PlayerButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label={t('volume')}
                onChange={event => {
                  const value = Number(event.target.value);
                  setVolume(value);
                  setMuted(value === 0);
                  storeVolume(value);
                }}
                className="w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/volume:w-20 group-hover/volume:opacity-100 focus:w-20 focus:opacity-100 @max-md/player:hidden"
              />
            </span>
            <button
              type="button"
              onClick={() => setRate(value => SPEEDS[(SPEEDS.indexOf(value) + 1) % SPEEDS.length]!)}
              aria-label={t('speed')}
              title={t('speed')}
              className="h-8 min-w-11 rounded-full px-2 text-[13px] font-semibold tabular-nums text-stage-ink transition-colors hover:bg-white/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {rate}×
            </button>
            {canPip ? (
              <PlayerButton label={t('pictureInPicture')} onClick={togglePip} className="@max-md/player:hidden">
                <PictureInPicture2 size={18} />
              </PlayerButton>
            ) : null}
            <PlayerButton label={fullscreen ? t('exitFullScreen') : t('fullScreen')} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </PlayerButton>
          </div>
        </div>
      </div>
    </div>
  );
}
