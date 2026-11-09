'use client';

import { PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Trash2, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';
import type { CallOutcome, CallSummary } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

const OUTCOME_KEY = {
  answered: 'answered',
  no_answer: 'noAnswer',
  declined: 'declined',
  cancelled: 'cancelled',
  busy: 'busy',
  failed: 'failed',
} as const satisfies Record<CallOutcome, string>;

export interface CallEntryProps {
  call: CallSummary;
  /** The viewer, so the entry can say incoming or outgoing. */
  viewerId: number;
  /** Removes it from this person's history only; a call happened to two people. */
  onDelete?(): void;
}

/** A finished call, shown in the conversation as a compact centred row. */
export function CallEntry({ call, viewerId, onDelete }: CallEntryProps) {
  const t = useTranslations('talk.chat.call');
  const format = useTimeFormat();
  const outgoing = call.callerId === viewerId;
  const missed = !outgoing && (call.outcome === 'no_answer' || call.outcome === 'cancelled');
  const failed = call.outcome === 'failed' || call.outcome === 'busy';

  const Icon = missed ? PhoneMissed : failed ? PhoneOff : outgoing ? PhoneOutgoing : PhoneIncoming;
  const label = t(`outcome.${call.outcome ? OUTCOME_KEY[call.outcome] : 'answered'}`);

  return (
    <div className="group/call flex items-center justify-center gap-1 py-1">
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
          missed ? 'border-danger/40 bg-danger-soft text-danger' : 'border-line bg-surface text-ink',
        )}
      >
        <Icon size={14} aria-hidden="true" className={cn('shrink-0', missed ? 'text-danger' : outgoing ? 'text-ink-faint' : 'text-success')} />
        {call.media === 'video' ? <Video size={14} aria-hidden="true" className={cn('shrink-0', missed ? 'text-danger' : 'text-ink-faint')} /> : null}
        <span>
          {call.media === 'video' && call.outcome === 'answered' ? t('outcome.video') : label}
          {call.outcome === 'answered' && call.durationSeconds > 0 ? ` · ${format.durationWords(call.durationSeconds)}` : ''}
        </span>
        <span className={cn('font-normal tabular-nums', missed ? 'text-danger' : 'text-ink-faint')}>{format.time(call.startedAt)}</span>
      </div>

      {/* Out of the way until the row is hovered, but always reachable by keyboard. */}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('delete', { outcome: call.outcome ?? 'other' })}
          title={t('deleteTitle')}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            'text-ink-faint opacity-0 transition-[opacity,color,background-color] duration-150',
            'hover:bg-danger-soft hover:text-danger focus:outline-hidden focus-visible:ring-4 focus-visible:ring-danger/20',
            'group-hover/call:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}
