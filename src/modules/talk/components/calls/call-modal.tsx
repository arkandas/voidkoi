'use client';

import { Phone, PhoneOff, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { isVideoCall, statusKey } from '@/modules/talk/lib/call-machine';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useAlternatingTitle } from '@/modules/talk/lib/hooks/use-tab-title';
import { formatDuration } from '@/lib/format';

import { CallDialog } from './call-dialog';
import { CallPanel } from './call-panel';
import { CallStage } from './call-stage';
import { ANSWER, CALL_CONTROL } from './controls';

/** A round call control with its name under it. */
function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-sm font-medium text-ink">{label}</span>
    </div>
  );
}

export function CallModal() {
  const t = useTranslations('talk.calls');
  const { state, accept, decline, cancel } = useCall();
  const key = statusKey(state);
  const status = key ? t(`status.${key}`) : '';

  // While minimised the pill takes over; the dialog steps aside.
  const open = state.status !== 'idle' && !state.minimized;

  useAlternatingTitle(
    state.status === 'ringing',
    state.peer ? t('modal.tabTitle', { media: state.media, name: state.peer.displayName }) : t('modal.tabTitleNoName'),
  );

  if (state.status === 'idle' || !state.peer) return null;

  // A connected video call is a stage, not a dialog around a picture.
  if (isVideoCall(state) && state.status === 'in-call') {
    return (
      <CallDialog open={open} size="stage" label={status} className="overflow-hidden border-0 bg-stage">
        <CallStage />
      </CallDialog>
    );
  }

  // A connected audio call is a panel: wide, with the waveform across it.
  if (state.status === 'in-call') {
    return (
      <CallDialog open={open} size="lg" label={status}>
        <CallPanel />
      </CallDialog>
    );
  }

  const ringing = state.status === 'ringing' || state.status === 'calling';

  return (
    <CallDialog open={open} label={status} className="px-6 pt-10 pb-7 sm:px-8">
      <div className="flex flex-col items-center text-center">
        <PersonAvatar person={state.peer} size="lg" ringing={ringing} />

        <p className="mt-6 text-2xl font-bold tracking-tight text-ink">{state.peer.displayName}</p>
        {isVideoCall(state) ? (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
            <Video size={14} aria-hidden="true" />
            {t('modal.videoCall')}
          </span>
        ) : null}
        <p className={cn('mt-2 text-base text-ink-muted', state.status === 'ended' && 'font-medium')}>{status}</p>
        {state.status === 'ended' && state.endedDuration > 0 ? (
          <p className="mt-0.5 text-sm text-ink-faint tabular-nums">{formatDuration(state.endedDuration)}</p>
        ) : null}

        {state.status === 'ringing' ? (
          <div className="mt-8 flex items-start justify-center gap-12">
            <Control label={t('modal.decline')}>
              <IconButton variant="destructive" label={t('modal.declineCall')} onClick={decline} icon={<PhoneOff size={26} />} className={CALL_CONTROL} />
            </Control>
            <Control label={t('modal.accept')}>
              <IconButton
                variant="default"
                label={t('modal.acceptCall')}
                onClick={accept}
                icon={state.media === 'video' ? <Video size={26} /> : <Phone size={26} />}
                className={cn(CALL_CONTROL, ANSWER)}
              />
            </Control>
          </div>
        ) : null}

        {state.status === 'calling' ? (
          <div className="mt-8">
            <Control label={t('modal.cancel')}>
              <IconButton variant="destructive" label={t('modal.cancelCall')} onClick={cancel} icon={<PhoneOff size={26} />} className={CALL_CONTROL} />
            </Control>
          </div>
        ) : null}
      </div>
    </CallDialog>
  );
}
