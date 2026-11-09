'use client';

import { Mic, MicOff, Minimize2, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { showsLocalVideo, showsRemoteVideo, type CallState } from '@/modules/talk/lib/call-machine';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useCallTimer } from '@/modules/talk/lib/hooks/use-call-timer';
import { formatDuration } from '@/lib/format';

import { DeviceMenu } from './device-menu';
import { VideoSurface } from './video-surface';

/** The dot of the connection between the two browsers, in fixed colours: the stage is dark in both themes. */
function ConnectionDot({ state }: { state: CallState }) {
  const t = useTranslations('talk.calls.status');
  const connected = state.connection === 'connected';
  const failed = state.connection === 'failed';
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-2 rounded-full', failed ? 'bg-[#f87171]' : connected ? 'bg-[#34d399]' : 'animate-pulse bg-[#fbbf24]')} />
      <span className="text-sm font-medium text-stage-ink-muted">{t(failed ? 'connectionFailed' : connected ? 'connected' : 'connecting')}</span>
    </span>
  );
}

/**
 * A connected video call: the other person fills the frame, your own camera
 * sits in the corner, and the controls float over the bottom. Dark whatever
 * the theme, like every call screen.
 */
export function CallStage() {
  const { state, hangup, toggleMute, toggleCamera, toggleMinimized, remoteStream, localStream } = useCall();
  const t = useTranslations('talk.calls');
  const seconds = useCallTimer(state);

  if (!state.peer) return null;

  const remoteVisible = showsRemoteVideo(state);
  const localVisible = showsLocalVideo(state);

  return (
    <div className="dark relative aspect-video w-full overflow-hidden bg-stage">
      {/* The other person, or their picture whenever no frames are arriving. */}
      {remoteVisible ? (
        <VideoSurface stream={remoteStream} label={t('stage.peerCamera', { name: state.peer.displayName })} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <PersonAvatar person={state.peer} size="lg" />
          <p className="text-stage-ink-muted">
            {state.connection === 'connected' ? t('stage.peerCameraOff', { name: state.peer.displayName }) : t('status.connecting')}
          </p>
        </div>
      )}

      {/* Name and timer, on their own ground so they read over any frame. */}
      <div className="scrim-top absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-5 pt-4 pb-10">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight text-stage-ink">{state.peer.displayName}</p>
          <ConnectionDot state={state} />
        </div>
        <p className="text-lg font-bold text-stage-ink tabular-nums">{formatDuration(seconds)}</p>
      </div>

      {/* Your own camera: mirrored, muted, and out of the way. */}
      {localVisible ? (
        <div className="absolute right-4 bottom-24 w-40 overflow-hidden rounded-xl border border-white/20 shadow-2xl sm:w-48">
          <div className="aspect-video bg-stage">
            <VideoSurface stream={localStream} muted mirrored label={t('stage.yourCamera')} />
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-linear-to-t from-stage/85 to-transparent px-5 pt-10 pb-5">
        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/40 p-2 backdrop-blur-md">
          <div className="relative">
            <IconButton
              size="lg"
              variant={state.muted ? 'destructive' : 'stage'}
              label={t(state.muted ? 'controls.unmuteMicrophone' : 'controls.muteMicrophone')}
              aria-pressed={state.muted}
              onClick={toggleMute}
              icon={state.muted ? <MicOff size={20} /> : <Mic size={20} />}
            />
            <DeviceMenu kind="audioinput" tone="stage" className="absolute -top-1 -right-1" />
          </div>
          <div className="relative">
            <IconButton
              size="lg"
              variant={state.cameraOff ? 'destructive' : 'stage'}
              label={t(state.cameraOff ? 'controls.cameraOn' : 'controls.cameraOff')}
              aria-pressed={state.cameraOff}
              disabled={!state.cameraAvailable}
              onClick={toggleCamera}
              icon={state.cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
            />
            {state.cameraAvailable ? <DeviceMenu kind="videoinput" tone="stage" className="absolute -top-1 -right-1" /> : null}
          </div>
          <IconButton size="lg" variant="stage" label={t('controls.minimiseCall')} onClick={toggleMinimized} icon={<Minimize2 size={20} />} />
          <IconButton size="lg" variant="destructive" label={t('controls.hangUp')} onClick={hangup} icon={<PhoneOff size={20} />} className="w-16" />
        </div>
      </div>

      {!state.cameraAvailable ? (
        <p className="absolute bottom-5 left-5 rounded-full bg-black/60 px-3 py-1.5 text-sm text-[#fbbf24]">{t('stage.noCamera')}</p>
      ) : null}
    </div>
  );
}
