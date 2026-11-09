'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { EmptyState, Spinner } from '@/components/ui';
import { findMember, startsRun } from '@/modules/talk/lib/groups';
import type { PendingUpload } from '@/modules/talk/lib/hooks/use-uploads';
import type { Attachment, ChatMessage, GroupInfo, TimelineItem } from '@/modules/talk/lib/protocol';
import { groupByDay, useTimeFormat } from '@/modules/talk/lib/time';

import { CallEntry } from './call-entry';
import { DayDivider } from './day-divider';
import { GroupNotice } from './group-notice';
import { MessageBubble, type DeleteScope } from './message-bubble';
import { UploadBubble } from './upload-bubble';

export interface TimelineEntry {
  item: TimelineItem;
  /** Optimistic messages the server has not echoed back yet. */
  pending?: boolean;
  /** The sender's in-memory preview of a picture they sent from here. */
  localPreview?: string | null;
}

export interface MessageTimelineProps {
  entries: TimelineEntry[];
  viewerId: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore(): void;
  loading: boolean;
  onDeleteMessage?(messageId: number, scope: DeleteScope): void;
  onDeleteCall?(callId: number): void;
  /** Files still on their way, drawn after the newest message. */
  uploads?: readonly PendingUpload[];
  onCancelUpload?(key: string): void;
  onRetryUpload?(key: string): void;
  onOpenAttachment?(attachment: Attachment, message: ChatMessage): void;
  /** Set in a group: messages from others are signed, and notices are described. */
  group?: GroupInfo | null;
}

/** How close to the bottom still counts as following the conversation. */
const STICK_THRESHOLD_PX = 120;

export function MessageTimeline({
  entries,
  viewerId,
  hasMore,
  loadingMore,
  onLoadMore,
  loading,
  onDeleteMessage,
  onDeleteCall,
  uploads = [],
  onCancelUpload,
  onRetryUpload,
  onOpenAttachment,
  group = null,
}: MessageTimelineProps) {
  const t = useTranslations('talk.chat.timeline');
  const tNotice = useTranslations('talk.chat.notice');
  const format = useTimeFormat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);
  /** Scroll height before an older page is prepended, to hold the view still. */
  const previousHeight = useRef<number | null>(null);
  const lastCount = useRef(0);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    wasAtBottom.current = distanceFromBottom < STICK_THRESHOLD_PX;
    if (element.scrollTop < 80 && hasMore && !loadingMore) {
      previousHeight.current = element.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (previousHeight.current !== null) {
      // Older messages were prepended: keep the reader where they were.
      element.scrollTop = element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
      lastCount.current = entries.length + uploads.length;
      return;
    }

    // An upload joining the end counts as growth: you just sent it, so you see it.
    const count = entries.length + uploads.length;
    const grew = count > lastCount.current;
    lastCount.current = count;
    if (grew && wasAtBottom.current) element.scrollTop = element.scrollHeight;
  }, [entries, uploads.length]);

  useEffect(() => {
    // A conversation always opens at the newest message: now, and again on the
    // next frame, by when the browser has given the new list its padding.
    const element = scrollRef.current;
    if (!element || loading) return;
    element.scrollTop = element.scrollHeight;
    const frame = requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [loading]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  if (entries.length === 0 && uploads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon={<MessageCircle size={24} />} title={t('emptyTitle')} />
      </div>
    );
  }

  const days = groupByDay(entries, entry => (entry.item.kind === 'message' ? entry.item.createdAt : entry.item.startedAt));

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      // A transcript is a log: sequential content that grows at the end.
      role="log"
      aria-label={t('label')}
      aria-live="polite"
      className="themed-scroll flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
    >
      {loadingMore ? (
        <div className="flex justify-center py-2">
          <Spinner label={t('loadingEarlier')} />
        </div>
      ) : null}

      {days.map(day => (
        <section key={day.day} className="flex flex-col gap-2">
          <DayDivider label={format.dayLabel(day.items[0]!.item.kind === 'message' ? day.items[0]!.item.createdAt : day.items[0]!.item.startedAt)} />
          {day.items.map((entry, index) => {
            const item = entry.item;
            if (item.kind === 'message' && item.event) {
              return <GroupNotice key={`m-${item.id}`} message={item} event={item.event} group={group} viewerId={viewerId} />;
            }
            if (item.kind === 'message') {
              return (
                <MessageBubble
                  key={`m-${item.id}`}
                  message={item}
                  own={item.senderId === viewerId}
                  pending={entry.pending}
                  localPreview={entry.localPreview ?? null}
                  senderName={
                    group !== null && item.senderId !== viewerId && startsRun(day.items[index - 1]?.item, item)
                      ? (findMember(group, item.senderId)?.displayName ?? tNotice('someone'))
                      : null
                  }
                  {...(onOpenAttachment ? { onOpenAttachment: (attachment: Attachment) => onOpenAttachment(attachment, item) } : {})}
                  {...(onDeleteMessage ? { onDelete: (scope: DeleteScope) => onDeleteMessage(item.id, scope) } : {})}
                />
              );
            }
            return <CallEntry key={`c-${item.id}`} call={item} viewerId={viewerId} {...(onDeleteCall ? { onDelete: () => onDeleteCall(item.id) } : {})} />;
          })}
        </section>
      ))}

      {uploads.length > 0 ? (
        // Off inside the log: a percentage ticking up is not news. A failure still speaks, through its own alert.
        <div aria-live="off" className="mt-2 flex flex-col gap-2">
          {uploads.map(upload => (
            <UploadBubble key={upload.key} upload={upload} onCancel={() => onCancelUpload?.(upload.key)} onRetry={() => onRetryUpload?.(upload.key)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
