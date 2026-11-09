'use client';

import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Trash2, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { Button, EmptyState, IconButton, Segmented, Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { api } from '@/modules/talk/lib/api';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useRealtimeMessages } from '@/modules/talk/lib/hooks/use-realtime';
import { useTalkData } from '@/modules/talk/lib/hooks/use-talk-data';
import { useTalkMe } from '@/modules/talk/lib/hooks/use-talk-me';
import type { CallHistoryEntry, CallsFilter } from '@/modules/talk/lib/protocol';
import { useTimeFormat, type TimeFormat } from '@/modules/talk/lib/time';

const PAGE_SIZE = 50;

type OutcomeWords = ReturnType<typeof useTranslations<'talk.calls.history.outcome'>>;

function outcomeText(call: CallHistoryEntry, t: OutcomeWords, time: TimeFormat): string {
  switch (call.outcome) {
    case 'answered':
      return call.durationSeconds > 0 ? time.durationWords(call.durationSeconds) : t('answered');
    case 'no_answer':
      return t(call.direction === 'incoming' ? 'missed' : 'noAnswer');
    case 'declined':
      return t(call.direction === 'incoming' ? 'declined' : 'declinedByThem');
    case 'cancelled':
      return t(call.direction === 'incoming' ? 'missed' : 'cancelled');
    case 'busy':
      return t('busy');
    case 'failed':
      return t('failed');
    default:
      return '';
  }
}

export function CallsPage() {
  const me = useTalkMe();
  const { clearMissedBadge, refreshCallBadge } = useTalkData();
  const { startCall, state: callState } = useCall();
  const toast = useToast();
  const t = useTranslations('talk.calls.history');
  const tOutcome = useTranslations('talk.calls.history.outcome');
  const time = useTimeFormat();

  const filters: Array<{ value: CallsFilter; label: string }> = [
    { value: 'all', label: t('filterAll') },
    { value: 'missed', label: t('filterMissed') },
  ];

  const [filter, setFilter] = useState<CallsFilter>('all');
  const [calls, setCalls] = useState<CallHistoryEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Bumped to fetch the current filter again after a call ends. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await api.calls({ filter, limit: PAGE_SIZE });
        if (cancelled) return;
        setCalls(page.calls);
        setNextBefore(page.nextBefore);
      } catch {
        if (!cancelled) toast.show(t('loadFailed'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, reloadToken]);

  // Opening this page is what acknowledges missed calls.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api.markCallsSeen();
        if (cancelled) return;
        clearMissedBadge();
        await refreshCallBadge();
      } catch {
        // The badge stays until the next visit.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearMissedBadge, refreshCallBadge]);

  useRealtimeMessages(message => {
    if (message.type === 'call-ended') setReloadToken(token => token + 1);
  });

  const loadMore = async (): Promise<void> => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.calls({ filter, before: nextBefore, limit: PAGE_SIZE });
      setCalls(current => [...current, ...page.calls]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.show(t('loadMoreFailed'), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const callDisabled = callState.status !== 'idle' && callState.status !== 'ended';

  /** Only ever this person's log: a call happened to two people. */
  const onDeleteCall = (callId: number): void => {
    setCalls(current => current.filter(call => call.id !== callId));
    void api.deleteCall(callId).catch(() => {
      toast.show(t('deleteFailed'), 'error');
      setReloadToken(token => token + 1);
    });
  };

  const onClearHistory = (): void => {
    setCalls([]);
    setNextBefore(null);
    void api.clearCallHistory().catch(() => {
      toast.show(t('clearFailed'), 'error');
      setReloadToken(token => token + 1);
    });
  };

  return (
    <PageLayout
      className="space-y-2"
      header={
        <PageHeader
          icon={<Phone size={18} />}
          title={t('title')}
          action={
            <div className="flex items-center gap-2">
              {calls.length > 0 ? (
                <Button variant="outline" size="sm" icon={<Trash2 size={14} />} onClick={onClearHistory}>
                  {t('clear')}
                </Button>
              ) : null}
              <Segmented<CallsFilter> ariaLabel={t('filterLabel')} value={filter} onChange={setFilter} options={filters} />
            </div>
          }
        />
      }
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('loading')} />
        </div>
      ) : calls.length === 0 ? (
        <EmptyState className="py-16" icon={<Phone size={24} />} title={filter === 'missed' ? t('emptyMissed') : t('empty')} />
      ) : (
        <>
          <ul aria-label={t('listLabel')} className="space-y-2">
            {calls.map(call => {
              const outcome = outcomeText(call, tOutcome, time);
              const Icon = call.missed ? PhoneMissed : call.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
              return (
                <li key={call.id} className="group flex items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-xs sm:px-4">
                  <PersonAvatar person={call.other} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[15px] font-semibold', call.missed ? 'text-danger' : 'text-ink')}>
                      {call.other.displayName}
                      <span className="sr-only">{` ${t('summary', { direction: call.direction, outcome })}`}</span>
                    </p>
                    <p className={cn('mt-0.5 flex items-center gap-1.5 truncate text-sm', call.missed ? 'text-danger' : 'text-ink-muted')}>
                      <Icon
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', call.missed ? 'text-danger' : call.direction === 'incoming' ? 'text-success' : 'text-ink-faint')}
                      />
                      {call.media === 'video' ? <Video size={14} aria-hidden="true" className="shrink-0 text-ink-faint" /> : null}
                      {time.callTime(call.startedAt)} · {outcome}
                    </p>
                  </div>
                  <IconButton
                    variant="ghost"
                    label={t('deleteLabel', { direction: call.direction, name: call.other.displayName })}
                    title={t('deleteTitle')}
                    onClick={() => onDeleteCall(call.id)}
                    icon={<Trash2 size={16} />}
                    className="size-9 text-ink-faint opacity-100 hover:bg-danger-soft hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  />
                  <IconButton
                    variant="outline"
                    label={t(call.media === 'video' ? 'videoCallBack' : 'callBack', { name: call.other.displayName })}
                    disabled={callDisabled || call.other.id === me.id}
                    onClick={() => startCall(call.other, call.media)}
                    icon={call.media === 'video' ? <Video size={18} /> : <Phone size={18} />}
                  />
                </li>
              );
            })}
          </ul>

          {nextBefore !== null ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t('loadingMore') : t('loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </PageLayout>
  );
}
