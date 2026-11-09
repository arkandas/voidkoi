'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ClientMessage, PresenceUser, ServerToClientMessage, UserStatus } from '../protocol';
import { createRealtimeClient, type RealtimeClient, type RealtimeStatus } from '../realtime';

type Listener = (message: ServerToClientMessage) => void;

/**
 * How often an on-screen page says it is still there. Well inside the
 * server's minute (WATCHING_WINDOW_MS): a phone can freeze a page without a
 * visibilitychange, and a page that goes quiet gets notifications again.
 */
const HEARTBEAT_MS = 25_000;

interface RealtimeContextValue {
  status: RealtimeStatus;
  statusOf(userId: number): UserStatus;
  send(message: ClientMessage): boolean;
  /** Subscribe to server frames. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void;
  /** Runs after the socket comes back, so a page can refill what it missed. */
  onReconnect(handler: () => void): () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  // One client for the life of the provider, built lazily so the socket is
  // never created during a server render.
  const [client] = useState<RealtimeClient>(() => createRealtimeClient());
  const [listeners] = useState<Set<Listener>>(() => new Set());
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [presence, setPresence] = useState<Map<number, PresenceUser>>(new Map());

  useEffect(() => {
    const offStatus = client.onStatus(setStatus);
    const offMessage = client.onMessage((message) => {
      if (message.type === 'welcome' || message.type === 'presence') {
        setPresence(new Map(message.users.map((user) => [user.id, user])));
      }
      // Copy first: a listener may unsubscribe while we are iterating.
      for (const listener of [...listeners]) listener(message);
    });

    client.connect();
    return () => {
      offStatus();
      offMessage();
      client.disconnect();
    };
  }, [client, listeners]);

  // Tell the server whether anyone is looking, so it knows when a message or
  // a call needs a notification instead. Said on every (re)connect, on every
  // change, and repeated while on screen.
  useEffect(() => {
    const visible = (): boolean => document.visibilityState === 'visible';
    const report = (): void => {
      client.send({ type: 'visibility', visible: visible() });
    };

    const offStatus = client.onStatus((next) => {
      if (next === 'open') report();
    });
    document.addEventListener('visibilitychange', report);
    const heartbeat = setInterval(() => {
      if (visible()) client.send({ type: 'ping' });
    }, HEARTBEAT_MS);

    return () => {
      offStatus();
      document.removeEventListener('visibilitychange', report);
      clearInterval(heartbeat);
    };
  }, [client]);

  const subscribe = useCallback(
    (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [listeners],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      statusOf: (userId: number) => presence.get(userId)?.status ?? 'offline',
      send: (message: ClientMessage) => client.send(message),
      subscribe,
      onReconnect: (handler: () => void) => client.onReconnect(handler),
    }),
    [status, presence, client, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside a RealtimeProvider');
  return context;
}

/**
 * Subscribe to server frames for the lifetime of a component.
 *
 * The handler is kept in a ref, so a page can close over fresh state without
 * re-subscribing (and dropping frames) on every render.
 */
export function useRealtimeMessages(handler: Listener): void {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(handler);

  // Refreshed after every render, so the subscription below always calls the
  // latest closure without being torn down and rebuilt.
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => subscribe((message) => handlerRef.current(message)), [subscribe]);
}

/** Run a callback whenever the socket reconnects after a drop. */
export function useOnReconnect(handler: () => void): void {
  const { onReconnect } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => onReconnect(() => handlerRef.current()), [onReconnect]);
}
