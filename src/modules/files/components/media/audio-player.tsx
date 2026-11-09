'use client';

import { Loader2, Music, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ViewerSource } from '@/modules/files/components/viewer';
import type { ItemDto, MediaInfoDto } from '@/modules/files/lib/api-types';
import { cn } from '@/lib/cn';
import { playsDirectly, previewKind } from '@/lib/file-types';

import { formatTime, PlayerButton, SeekBar, storeVolume, storedVolume, useMediaInfo } from './controls';

const STEP = 15;

interface AudioPlayer {
  /** The song playing, or paused; null when nothing is. */
  current: ItemDto | null;
  info: MediaInfoDto | null | undefined;
  cover: string | null;
  playing: boolean;
  waiting: boolean;
  failed: boolean;
  time: number;
  duration: number | null;
  buffered: number;
  volume: number;
  muted: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  /** Plays a song from a list, the rest of which follow it. */
  play(queue: ItemDto[], index: number, source: ViewerSource): void;
  toggle(): void;
  pause(): void;
  seek(seconds: number): void;
  previous(): void;
  next(): void;
  stop(): void;
  setVolume(volume: number): void;
  toggleMute(): void;
}

const PlayerContext = createContext<AudioPlayer | null>(null);

export function useAudioPlayer(): AudioPlayer | null {
  return useContext(PlayerContext);
}

/** The song's own title from its tags, or its name without the extension. */
export function trackTitle(item: ItemDto, info: MediaInfoDto | null | undefined): string {
  return info?.title || item.name.replace(/\.[^.]+$/, '');
}

/**
 * One player for songs, kept while the app is open: it plays on after the
 * viewer closes, with the mini player as its controls. Songs the browser
 * can't play itself play through the server.
 */
export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const resume = useRef(false);
  const [queue, setQueue] = useState<ItemDto[]>([]);
  const [index, setIndex] = useState(0);
  const [source, setSource] = useState<ViewerSource | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [offset, setOffset] = useState(0);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [volume, setVolumeState] = useState(storedVolume);
  const [muted, setMuted] = useState(false);

  const current = queue[index] ?? null;
  const info = useMediaInfo(current && source ? source.media(current) : '');
  const src = current && source ? (streaming ? source.stream(current, offset) : source.content(current)) : undefined;
  const duration = streaming ? (info?.duration ?? null) : (length ?? info?.duration ?? null);
  const cover = current?.hasThumbnail && source ? source.thumbnail(current) : null;

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = volume;
    element.muted = muted;
  }, [volume, muted, src]);

  const start = useCallback((tracks: ItemDto[], at: number) => {
    resume.current = true;
    setIndex(at);
    setStreaming(!playsDirectly(tracks[at]?.mime));
    setOffset(0);
    setTime(0);
    setLength(null);
    setBuffered(0);
    setFailed(false);
    setWaiting(true);
  }, []);

  const play = useCallback(
    (tracks: ItemDto[], at: number, from: ViewerSource) => {
      if (tracks[at] && current?.id === tracks[at].id && source === from) {
        void audio.current?.play().catch(() => {});
        return;
      }
      setQueue(tracks);
      setSource(from);
      start(tracks, at);
    },
    [current, source, start],
  );

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element || !current) return;
    if (element.paused || element.ended) void element.play().catch(() => {});
    else element.pause();
  }, [current]);

  const pause = useCallback(() => audio.current?.pause(), []);

  const seek = useCallback(
    (seconds: number) => {
      const element = audio.current;
      if (!element) return;
      const target = Math.max(0, duration ? Math.min(seconds, duration - 0.25) : seconds);
      if (!streaming) {
        element.currentTime = target;
        return;
      }
      resume.current = !element.paused;
      setTime(target);
      setBuffered(target);
      setOffset(target);
    },
    [duration, streaming],
  );

  const next = useCallback(() => {
    if (index < queue.length - 1) start(queue, index + 1);
  }, [index, queue, start]);

  const previous = useCallback(() => {
    // A little way into a song, back to its start, as music players do.
    if (time > 3 || index === 0) seek(0);
    else start(queue, index - 1);
  }, [time, index, queue, start, seek]);

  const stop = useCallback(() => {
    audio.current?.pause();
    setQueue([]);
    setIndex(0);
    setPlaying(false);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    setMuted(value === 0);
    storeVolume(value);
  }, []);

  // The system's Now Playing and the media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (!current) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: trackTitle(current, info),
      artist: info?.artist ?? '',
      album: info?.album ?? '',
      artwork: cover ? [{ src: new URL(cover, window.location.href).href, sizes: '480x480', type: 'image/webp' }] : [],
    });
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ['play', () => void audio.current?.play().catch(() => {})],
      ['pause', () => audio.current?.pause()],
      ['previoustrack', previous],
      ['nexttrack', index < queue.length - 1 ? next : null],
      ['seekbackward', () => seek(time - STEP)],
      ['seekforward', () => seek(time + STEP)],
      ['seekto', details => (details.seekTime !== undefined ? seek(details.seekTime) : undefined)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser knows every action.
      }
    }
  }, [current, info, cover, previous, next, seek, time, index, queue.length]);

  const value = useMemo<AudioPlayer>(
    () => ({
      current,
      info,
      cover,
      playing,
      waiting,
      failed,
      time,
      duration,
      buffered,
      volume,
      muted,
      hasPrevious: index > 0 || time > 3,
      hasNext: index < queue.length - 1,
      play,
      toggle,
      pause,
      seek,
      previous,
      next,
      stop,
      setVolume,
      toggleMute: () => setMuted(value => !value),
    }),
    [current, info, cover, playing, waiting, failed, time, duration, buffered, volume, muted, index, queue.length, play, toggle, pause, seek, previous, next, stop, setVolume],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {src ? (
        <audio
          key={src}
          ref={audio}
          src={src}
          preload="auto"
          onLoadedMetadata={event => {
            const element = event.currentTarget;
            if (!streaming && Number.isFinite(element.duration)) setLength(element.duration);
          }}
          onCanPlay={event => {
            setWaiting(false);
            if (resume.current) void event.currentTarget.play().catch(() => {});
            resume.current = false;
          }}
          onTimeUpdate={event => setTime(offset + event.currentTarget.currentTime)}
          onProgress={event => {
            const ranges = event.currentTarget.buffered;
            if (ranges.length > 0) setBuffered(offset + ranges.end(ranges.length - 1));
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onEnded={() => {
            setPlaying(false);
            if (index < queue.length - 1) start(queue, index + 1);
          }}
          onError={() => {
            // The browser couldn't play it after all: through the server, from where it was.
            if (!streaming && info?.playable !== false) {
              resume.current = true;
              setOffset(Math.floor(time));
              setStreaming(true);
            } else {
              setFailed(true);
              setWaiting(false);
            }
          }}
        />
      ) : null}
    </PlayerContext.Provider>
  );
}

function Cover({ src, className, iconSize }: { src: string | null; className?: string; iconSize: number }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden', className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : <Music size={iconSize} aria-hidden="true" />}
    </span>
  );
}

/**
 * A song in the viewer: its cover, tags and controls. The viewer follows the
 * player when it moves on to the next song. `compact` is the one on a link's
 * page, which waits to be played.
 */
export function AudioPanel({
  items,
  item,
  source,
  onTrack,
  compact = false,
}: {
  items: ItemDto[];
  item: ItemDto;
  source: ViewerSource;
  onTrack(item: ItemDto): void;
  compact?: boolean;
}) {
  const t = useTranslations('files.player');
  const player = useAudioPlayer();
  const info = useMediaInfo(source.media(item));
  const tracks = useMemo(() => items.filter(entry => previewKind(entry.mime, entry.name) === 'audio'), [items]);
  const isCurrent = player?.current?.id === item.id;
  const playRef = useRef(player?.play);
  const trackRef = useRef(onTrack);
  const playButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    playRef.current = player?.play;
    trackRef.current = onTrack;
  });

  // In the viewer the keyboard is the player's: space plays and pauses. After the viewer has placed its own focus.
  useEffect(() => {
    if (compact) return;
    const focus = setTimeout(() => playButton.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(focus);
  }, [compact]);

  useEffect(() => {
    if (isCurrent || compact) return;
    const at = tracks.findIndex(entry => entry.id === item.id);
    if (at >= 0) playRef.current?.(tracks, at, source);
    // Only when the viewer moves to another song: the player's own moves come back through onTrack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // The viewer follows when the song shown here ends or is skipped, not when another song gives way to it.
  const currentId = player?.current?.id;
  const previousId = useRef(currentId);
  useEffect(() => {
    const was = previousId.current;
    previousId.current = currentId;
    if (was !== item.id || currentId === undefined || currentId === item.id) return;
    const next = tracks.find(entry => entry.id === currentId);
    if (next) trackRef.current(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (!player) return null;
  const cover = item.hasThumbnail ? source.thumbnail(item) : null;
  const details = [info?.artist, info?.album].filter(Boolean).join(' · ');
  const VolumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex w-full max-w-md flex-col items-center text-stage-ink">
      <Cover
        src={cover}
        iconSize={56}
        className={cn(
          'aspect-square w-full rounded-2xl bg-white/10 text-stage-ink-muted shadow-2xl',
          compact ? 'max-w-[min(12rem,30dvh)]' : 'max-w-[min(18rem,40dvh)]',
        )}
      />
      <div className="mt-6 w-full text-center">
        <p className="truncate text-lg font-semibold">{trackTitle(item, info)}</p>
        <p className="mt-0.5 h-5 truncate text-sm text-stage-ink-muted">{details}</p>
      </div>
      {isCurrent && player.failed ? (
        <p className="mt-6 text-sm font-medium text-stage-ink-muted">{t('cantPlay')}</p>
      ) : (
        <>
          <div className="mt-5 w-full">
            <SeekBar time={isCurrent ? player.time : 0} duration={isCurrent ? player.duration : null} buffered={isCurrent ? player.buffered : 0} onSeek={player.seek} label={t('seek')} />
            <div className="mt-1 flex justify-between text-xs tabular-nums text-stage-ink-muted">
              <span>{formatTime(isCurrent ? player.time : 0)}</span>
              <span>{formatTime(isCurrent ? player.duration : info?.duration)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PlayerButton label={t('previous')} onClick={player.previous} disabled={!isCurrent}>
              <SkipBack size={20} fill="currentColor" />
            </PlayerButton>
            <PlayerButton label={t('back', { seconds: STEP })} onClick={() => player.seek(player.time - STEP)} disabled={!isCurrent}>
              <RotateCcw size={19} />
            </PlayerButton>
            <PlayerButton
              ref={playButton}
              large
              label={player.playing && isCurrent ? t('pause') : t('play')}
              onClick={() => (isCurrent ? player.toggle() : player.play(tracks, tracks.findIndex(entry => entry.id === item.id), source))}
              className="bg-white text-stage hover:bg-white/90"
            >
              {isCurrent && player.waiting ? (
                <Loader2 size={24} className="animate-spin" />
              ) : player.playing && isCurrent ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" className="translate-x-0.5" />
              )}
            </PlayerButton>
            <PlayerButton label={t('forward', { seconds: STEP })} onClick={() => player.seek(player.time + STEP)} disabled={!isCurrent}>
              <RotateCw size={19} />
            </PlayerButton>
            <PlayerButton label={t('next')} onClick={player.next} disabled={!isCurrent || !player.hasNext}>
              <SkipForward size={20} fill="currentColor" />
            </PlayerButton>
          </div>
          <div className="mt-4 flex w-48 items-center gap-2 text-stage-ink-muted">
            <PlayerButton label={player.muted ? t('unmute') : t('mute')} onClick={player.toggleMute} className="size-8">
              <VolumeIcon size={17} />
            </PlayerButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={player.muted ? 0 : player.volume}
              aria-label={t('volume')}
              onChange={event => player.setVolume(Number(event.target.value))}
              className="w-full cursor-pointer accent-white"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The song playing, at the bottom of the app: it plays on while you look around. */
export function MiniPlayer({ className }: { className?: string }) {
  const t = useTranslations('files.player');
  const player = useAudioPlayer();
  if (!player?.current) return null;
  const { current, info, cover, duration, time } = player;
  const fraction = duration ? Math.min(1, time / duration) : 0;
  const clock = `${formatTime(time)} / ${formatTime(duration)}`;

  return (
    <section aria-label={t('nowPlaying')} className={cn('relative flex shrink-0 items-center gap-3 overflow-hidden px-3 py-2', className)}>
      <Cover src={cover} iconSize={20} className="size-10 rounded-lg bg-muted text-ink-muted dark:bg-canvas" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{trackTitle(current, info)}</p>
        <p className="truncate text-[13px] text-ink-muted tabular-nums">{player.failed ? t('cantPlay') : (info?.artist ?? clock)}</p>
      </div>
      {info?.artist && !player.failed ? <span className="text-[13px] text-ink-muted tabular-nums max-sm:hidden">{clock}</span> : null}
      <PlayerButton tone="app" label={t('previous')} onClick={player.previous} className="max-sm:hidden">
        <SkipBack size={18} fill="currentColor" />
      </PlayerButton>
      <PlayerButton tone="app" label={player.playing ? t('pause') : t('play')} onClick={player.toggle}>
        {player.waiting ? (
          <Loader2 size={20} className="animate-spin" />
        ) : player.playing ? (
          <Pause size={20} fill="currentColor" />
        ) : (
          <Play size={20} fill="currentColor" className="translate-x-px" />
        )}
      </PlayerButton>
      <PlayerButton tone="app" label={t('next')} onClick={player.next} disabled={!player.hasNext}>
        <SkipForward size={18} fill="currentColor" />
      </PlayerButton>
      <PlayerButton tone="app" label={t('close')} onClick={player.stop}>
        <X size={18} />
      </PlayerButton>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
        <span className="block h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
      </span>
    </section>
  );
}
