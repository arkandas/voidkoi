'use client';

import { MessageCircle, Phone, Users, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader, PageLayout } from '@/components/layout/page-layout';
import { useMe } from '@/components/me';
import { Button, EmptyState, Spinner, useToast } from '@/components/ui';
import { STATUS_COLOUR, STATUS_KEY } from '@/modules/talk/components/chat/chat-header';
import { PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { api } from '@/modules/talk/lib/api';
import { useCall } from '@/modules/talk/lib/hooks/use-call';
import { useRealtime } from '@/modules/talk/lib/hooks/use-realtime';
import type { DirectoryUser } from '@/modules/talk/lib/protocol';

export function PeoplePage() {
  const t = useTranslations('talk.people');
  const me = useMe();
  const router = useRouter();
  const { statusOf } = useRealtime();
  const { startCall, state: callState } = useCall();
  const toast = useToast();

  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { users: directory } = await api.talkPeople();
        if (!cancelled) setUsers(directory);
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
  }, []);

  const others = users.filter(user => user.id !== me.id);
  const callDisabled = callState.status !== 'idle' && callState.status !== 'ended';

  return (
    <PageLayout className="space-y-2" header={<PageHeader icon={<Users size={18} />} title={t('title')} />}>
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('loading')} />
        </div>
      ) : others.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<Users size={24} />}
          title={t('empty.title')}
          // Admin is where an account is given Talk.
          action={me.role === 'ADMIN' ? <Button onClick={() => router.push('/admin')}>{t('empty.action')}</Button> : undefined}
        />
      ) : (
        <ul aria-label={t('listLabel')} className="space-y-2">
          {others.map(user => {
            const status = statusOf(user.id);
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-xs sm:flex-nowrap sm:px-4">
                <PersonAvatar person={user} size="md" status={status} dotRing="ring-card" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{user.displayName}</p>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">
                    @{user.username} · <span className={STATUS_COLOUR[status]}>{t(`status.${STATUS_KEY[status]}`)}</span>
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Button variant="outline" size="sm" icon={<MessageCircle size={16} />} onClick={() => router.push(`/talk?with=${user.id}`)} className="flex-1 sm:flex-none">
                    {t('message')}
                  </Button>
                  <Button variant="outline" size="sm" icon={<Video size={16} />} disabled={callDisabled} onClick={() => startCall(user, 'video')} className="flex-1 sm:flex-none">
                    {t('video')}
                  </Button>
                  <Button size="sm" icon={<Phone size={16} />} disabled={callDisabled} onClick={() => startCall(user, 'audio')} className="flex-1 sm:flex-none">
                    {t('call')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageLayout>
  );
}
