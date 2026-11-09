'use client';

import { Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconButton } from '@/components/ui';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { showsRemoteVideo } from '@/modules/talk/lib/call-machine';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useCallTimer } from '@/modules/talk/lib/hooks/use-call-timer';
import { formatDuration } from '@/lib/format';

import { VideoSurface } from './video-surface';

/**
 * The minimised call, so the rest of Talk stays usable while it goes on;
 * clicking it brings the call back. An audio call floats as a pill over the
 * panel on a wide screen and runs across the top on a phone. A video call
 * keeps its picture in a card over the page instead.
 */
export function CallPill() {
  const t = useTranslations('talk.calls');
  const { state, toggleMute, toggleCamera, toggleMinimized, hangup, remoteStream } = useCall();
  const seconds = useCallTimer(state);

  if (state.status !== 'in-call' || !state.minimized || !state.peer) return null;

  if (showsRemoteVideo(state)) {
    return (
      // Bottom right, clear of the header, the composer and the phone's tab bar.
      <div className="pointer-events-none absolute right-4 bottom-24 z-30 lg:right-8 lg:bottom-28">
        <div className="pointer-events-auto w-72 overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl dark:bg-surface">
          <button
            type="button"
            onClick={toggleMinimized}
            aria-label={t('controls.showCall')}
            title={t('controls.showCall')}
            className="group relative block w-full focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25"
          >
            <span className="block aspect-video bg-stage">
              <VideoSurface stream={remoteStream} muted label={t('stage.peerCamera', { name: state.peer.displayName })} />
            </span>
            <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 size={14} aria-hidden="true" />
            </span>
          </button>
          <div className="flex items-center gap-1.5 p-2">
            <span className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold text-ink">{state.peer.displayName}</span>
            <span className="pr-1 text-xs text-ink-muted tabular-nums">{formatDuration(seconds)}</span>
            <IconButton
              size="sm"
              variant={state.muted ? 'destructive' : 'outline'}
              label={t(state.muted ? 'controls.unmuteMicrophone' : 'controls.muteMicrophone')}
              aria-pressed={state.muted}
              onClick={toggleMute}
              icon={state.muted ? <MicOff size={15} /> : <Mic size={15} />}
            />
            <IconButton
              size="sm"
              variant={state.cameraOff ? 'destructive' : 'outline'}
              label={t(state.cameraOff ? 'controls.cameraOn' : 'controls.cameraOff')}
              aria-pressed={state.cameraOff}
              disabled={!state.cameraAvailable}
              onClick={toggleCamera}
              icon={state.cameraOff ? <VideoOff size={15} /> : <Video size={15} />}
            />
            <IconButton size="sm" variant="destructive" label={t('controls.hangUp')} onClick={hangup} icon={<PhoneOff size={15} />} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-line bg-surface lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-6 lg:z-30 lg:flex lg:justify-center lg:border-0 lg:bg-transparent">
      <div className="flex items-center gap-1.5 px-3 py-1.5 lg:pointer-events-auto lg:gap-1 lg:rounded-full lg:border lg:border-line-strong lg:bg-raised lg:p-1 lg:shadow-lg lg:dark:bg-card">
        <button
          type="button"
          onClick={toggleMinimized}
          // The name and timer inside don't say what the button does.
          aria-label={t('controls.showCall')}
          title={t('controls.showCall')}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full text-left transition-colors hover:bg-muted focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25 lg:flex-none lg:pr-2.5"
        >
          <PersonAvatar person={state.peer} size="sm" />
          <span className="min-w-0 truncate text-sm font-semibold text-ink lg:max-w-40">{state.peer.displayName}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted tabular-nums">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {formatDuration(seconds)}
          </span>
        </button>
        <IconButton
          size="sm"
          variant={state.muted ? 'destructive' : 'outline'}
          label={t(state.muted ? 'controls.unmuteMicrophone' : 'controls.muteMicrophone')}
          aria-pressed={state.muted}
          onClick={toggleMute}
          icon={state.muted ? <MicOff size={15} /> : <Mic size={15} />}
          className="rounded-full"
        />
        <IconButton size="sm" variant="destructive" label={t('controls.hangUp')} onClick={hangup} icon={<PhoneOff size={15} />} className="rounded-full" />
      </div>
    </div>
  );
}
