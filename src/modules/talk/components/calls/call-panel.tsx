'use client';

import { Mic, MicOff, Minimize2, PhoneOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import type { CallState } from '@/modules/talk/lib/call-machine';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useCallTimer } from '@/modules/talk/lib/hooks/use-call-timer';
import { formatDuration } from '@/lib/format';

import { CallWaveform } from './call-waveform';
import { CALL_CONTROL } from './controls';
import { DeviceMenu } from './device-menu';

/** The amber, green or red dot of the connection between the two browsers. */
function ConnectionIndicator({ state }: { state: CallState }) {
  const t = useTranslations('talk.calls.status');
  const connected = state.connection === 'connected';
  const failed = state.connection === 'failed';
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('size-2 rounded-full', failed ? 'bg-danger' : connected ? 'bg-success' : 'animate-pulse bg-warning')} />
      <span className={cn('text-sm font-medium', failed ? 'text-danger' : connected ? 'text-success' : 'text-warning')}>
        {t(failed ? 'connectionFailed' : connected ? 'connected' : 'connecting')}
      </span>
    </span>
  );
}

function Control({ label, danger = false, children }: { label: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className="flex w-20 flex-col items-center gap-2">
      {children}
      <span className={cn('text-sm font-medium', danger ? 'text-danger' : 'text-ink')}>{label}</span>
    </div>
  );
}

/**
 * A connected audio call, across the width: who you are talking to is a line
 * in the header band beside the timer, which leaves the width to the
 * waveform, the one thing on screen that moves.
 */
export function CallPanel() {
  const t = useTranslations('talk.calls.controls');
  const { state, hangup, toggleMute, toggleMinimized, remoteStream, localStream } = useCall();
  const seconds = useCallTimer(state);

  if (!state.peer) return null;

  return (
    <div>
      <div className="flex items-center gap-4 rounded-t-2xl border-b border-line bg-raised px-5 py-4 sm:px-6">
        <PersonAvatar person={state.peer} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold tracking-tight text-ink">{state.peer.displayName}</p>
          <ConnectionIndicator state={state} />
        </div>
        <p className="shrink-0 text-3xl font-bold tracking-tight text-ink tabular-nums">{formatDuration(seconds)}</p>
      </div>

      <div className="px-5 pt-5 sm:px-6">
        <CallWaveform remote={remoteStream} local={localStream} peerName={state.peer.displayName} />
      </div>

      <div className="flex items-start justify-center gap-4 px-5 pt-5 pb-6 sm:gap-8">
        <Control label={t(state.muted ? 'muted' : 'mute')} danger={state.muted}>
          <div className="relative">
            <IconButton
              // Red while muted, as every call app shows it: a button that looks the same
              // either way is how people spend a minute talking to nobody.
              variant={state.muted ? 'destructive' : 'outline'}
              label={t(state.muted ? 'unmuteMicrophone' : 'muteMicrophone')}
              aria-pressed={state.muted}
              onClick={toggleMute}
              icon={state.muted ? <MicOff size={24} /> : <Mic size={24} />}
              className={CALL_CONTROL}
            />
            <DeviceMenu kind="audioinput" className="absolute -top-0.5 -right-0.5" />
          </div>
        </Control>

        <Control label={t('minimise')}>
          <IconButton variant="outline" label={t('minimiseCall')} onClick={toggleMinimized} icon={<Minimize2 size={24} />} className={CALL_CONTROL} />
        </Control>

        <Control label={t('hangUp')}>
          <IconButton variant="destructive" label={t('hangUp')} onClick={hangup} icon={<PhoneOff size={24} />} className={CALL_CONTROL} />
        </Control>
      </div>
    </div>
  );
}
