'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { GroupAvatar, PersonAvatar } from '@/modules/talk/components/ui/person-avatar';
import { urls } from '@/modules/talk/lib/api';
import { conversationTitle, previewLine, type PreviewWords } from '@/modules/talk/lib/groups';
import { useNoticeWords } from '@/modules/talk/lib/hooks/use-notice-words';
import type { ConversationSummary, UserStatus } from '@/modules/talk/lib/protocol';
import { useTimeFormat } from '@/modules/talk/lib/time';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: number | null;
  onSelect(conversation: ConversationSummary): void;
  /** Opens the people picker, so an empty list is not a dead end. */
  onNew?(): void;
  statusOf(userId: number): UserStatus;
  /** What the list is filtered by, so an empty result can say so. */
  query?: string;
  /** You, so a group's preview can say "You: …". */
  viewerId: number;
}

export function ConversationList({ conversations, selectedId, onSelect, onNew, statusOf, query = '', viewerId }: ConversationListProps) {
  const t = useTranslations('talk.chat');
  const format = useTimeFormat();
  const notice = useNoticeWords();
  const words: PreviewWords = {
    notice,
    deleted: t('message.deleted'),
    photo: t('list.photo'),
    noMessages: t('list.noMessages'),
  };

  if (conversations.length === 0) {
    if (query.trim() !== '') {
      return <p className="px-1 py-6 text-center text-xs text-ink-muted">{t('list.noMatch', { query: query.trim() })}</p>;
    }
    return (
      <EmptyState
        icon={<MessageCircle size={24} />}
        title={t('list.emptyTitle')}
        action={onNew ? <Button onClick={onNew}>{t('startChat')}</Button> : undefined}
      />
    );
  }

  return (
    <ul aria-label={t('list.label')} className="flex flex-col gap-0.5">
      {conversations.map(conversation => {
        const selected = conversation.id === selectedId;
        const unread = conversation.unreadCount > 0 && !selected;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-ink transition-colors',
                'focus:outline-hidden focus-visible:ring-4 focus-visible:ring-accent/25',
                selected ? 'bg-accent-soft' : 'hover:bg-muted',
              )}
            >
              {selected ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" /> : null}
              {conversation.other ? (
                <PersonAvatar
                  person={conversation.other}
                  size="md"
                  status={statusOf(conversation.other.id)}
                  dotRing={selected ? 'ring-accent-soft' : 'ring-surface'}
                />
              ) : (
                <GroupAvatar size="md" photoUrl={urls.groupPhoto(conversation.id, conversation.group?.photoVersion ?? null)} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-[15px]', selected ? 'font-semibold text-accent' : unread ? 'font-semibold' : 'font-medium')}>
                    {conversationTitle(conversation)}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      // Faint ink is too dim on the open chat's tint in the dark theme.
                      unread ? 'font-semibold text-accent' : selected ? 'text-ink-muted' : 'text-ink-faint',
                    )}
                  >
                    {format.listTime(conversation.lastActivityAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', unread ? 'text-ink' : 'text-ink-muted')}>{previewLine(conversation, viewerId, words)}</span>
                  {conversation.unreadCount > 0 ? <Badge count>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</Badge> : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
