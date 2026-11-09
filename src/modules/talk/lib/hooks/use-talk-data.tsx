'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../api';
import { chimeFor } from '../message-sound';
import type { ConversationSummary } from '../protocol';
import { useOnReconnect, useRealtimeMessages } from './use-realtime';
import { useTalkMe } from './use-talk-me';

interface TalkDataValue {
  conversations: ConversationSummary[];
  totalUnread: number;
  unseenMissed: number;
  /** The largest file the server takes; null until it has said. */
  maxUploadBytes: number | null;
  loading: boolean;
  refreshConversations(): Promise<void>;
  refreshCallBadge(): Promise<void>;
  /** Called by the call log once it has seen the missed calls. */
  clearMissedBadge(): void;
}

const TalkDataContext = createContext<TalkDataValue | null>(null);

/**
 * What all of Talk needs: the conversation list and the two badges, kept in
 * one place so the list and its badge can't disagree, and refreshed from the
 * socket rather than polled.
 */
export function TalkDataProvider({ children }: { children: ReactNode }) {
  const me = useTalkMe();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [unseenMissed, setUnseenMissed] = useState(0);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshConversations = useCallback(async () => {
    try {
      const result = await api.conversations();
      setConversations(result.conversations);
      setTotalUnread(result.totalUnread);
    } catch {
      // The last good list stays; the socket brings the next try.
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCallBadge = useCallback(async () => {
    try {
      // One call is enough: this is only for the badge.
      setUnseenMissed((await api.calls({ limit: 1 })).unseenMissed);
    } catch {
      // A failed look must not blank the badge.
    }
  }, []);

  // The first look, with the state set after the round trip rather than during the effect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, callPage, config] = await Promise.all([
        api.conversations().catch(() => null),
        api.calls({ limit: 1 }).catch(() => null),
        api.config().catch(() => null),
      ]);
      if (cancelled) return;
      if (list) {
        setConversations(list.conversations);
        setTotalUnread(list.totalUnread);
      }
      if (callPage) setUnseenMissed(callPage.unseenMissed);
      if (config) setMaxUploadBytes(config.maxUploadBytes);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Anything that changes a list comes on the socket.
  useRealtimeMessages(message => {
    // Somebody else's words, not a group notice or your own from another device.
    if (message.type === 'message' && message.message.senderId !== me.id && !message.message.event) {
      void chimeFor(message.message.conversationId);
    }
    if (message.type === 'message' || message.type === 'conversation-removed' || message.type === 'conversation-changed') {
      void refreshConversations();
    } else if (message.type === 'call-ended') {
      void refreshConversations();
      void refreshCallBadge();
    }
  });

  // A dropped socket may have missed messages and calls entirely.
  useOnReconnect(() => {
    void refreshConversations();
    void refreshCallBadge();
  });

  const value = useMemo<TalkDataValue>(
    () => ({
      conversations,
      totalUnread,
      unseenMissed,
      maxUploadBytes,
      loading,
      refreshConversations,
      refreshCallBadge,
      clearMissedBadge: () => setUnseenMissed(0),
    }),
    [conversations, totalUnread, unseenMissed, maxUploadBytes, loading, refreshConversations, refreshCallBadge],
  );

  return <TalkDataContext.Provider value={value}>{children}</TalkDataContext.Provider>;
}

export function useTalkData(): TalkDataValue {
  const context = useContext(TalkDataContext);
  if (!context) throw new Error('useTalkData must be used inside Talk');
  return context;
}
