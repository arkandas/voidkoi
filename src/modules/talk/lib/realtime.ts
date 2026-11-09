/**
 * The browser's end of Talk's socket: typed frames, and coming back after a
 * drop with exponential backoff. The socket carries the session cookie, so
 * there is no handshake: the server says `welcome` as soon as it opens. One
 * told `replaced` stops coming back: a newer tab has taken over.
 */
import { urls } from './api';
import { parseServerMessage, type ClientMessage, type ServerToClientMessage } from './protocol';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'replaced';

export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  send(message: ClientMessage): boolean;
  /** Frames from the server. Returns the way to stop. */
  onMessage(handler: (message: ServerToClientMessage) => void): () => void;
  onStatus(handler: (status: RealtimeStatus) => void): () => void;
  /** After coming back from a drop, so a page can fetch what it missed. */
  onReconnect(handler: () => void): () => void;
  getStatus(): RealtimeStatus;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

export function createRealtimeClient(url: () => string = urls.socket): RealtimeClient {
  const messageHandlers = new Set<(message: ServerToClientMessage) => void>();
  const statusHandlers = new Set<(status: RealtimeStatus) => void>();
  const reconnectHandlers = new Set<() => void>();

  let socket: WebSocket | null = null;
  let status: RealtimeStatus = 'idle';
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let wantOpen = false;
  /** Once a socket has opened, the next open counts as coming back. */
  let hasConnectedBefore = false;

  const setStatus = (next: RealtimeStatus): void => {
    if (status === next) return;
    status = next;
    for (const handler of statusHandlers) handler(next);
  };

  /** Exponential backoff with jitter, so a restarted server isn't stampeded. */
  const nextDelay = (): number => {
    const capped = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
    return capped / 2 + Math.random() * (capped / 2);
  };

  const clearRetry = (): void => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = (): void => {
    if (!wantOpen || retryTimer !== null) return;
    setStatus('reconnecting');
    const delay = nextDelay();
    attempts += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
  };

  const open = (): void => {
    if (!wantOpen || socket !== null) return;
    setStatus(hasConnectedBefore ? 'reconnecting' : 'connecting');

    let next: WebSocket;
    try {
      next = new WebSocket(url());
    } catch {
      scheduleRetry();
      return;
    }
    socket = next;

    next.onopen = (): void => {
      attempts = 0;
      setStatus('open');
      if (hasConnectedBefore) for (const handler of reconnectHandlers) handler();
      hasConnectedBefore = true;
    };

    next.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      // A frame this page doesn't know is dropped, not thrown.
      if (!message) return;
      if (message.type === 'replaced') {
        wantOpen = false;
        clearRetry();
        setStatus('replaced');
      }
      for (const handler of messageHandlers) handler(message);
    };

    next.onclose = (): void => {
      socket = null;
      if (status === 'replaced' || !wantOpen) return;
      scheduleRetry();
    };

    next.onerror = (): void => {
      // `close` always follows, and tries again.
    };
  };

  return {
    connect(): void {
      if (status === 'replaced') return;
      wantOpen = true;
      open();
    },
    disconnect(): void {
      wantOpen = false;
      clearRetry();
      const current = socket;
      socket = null;
      if (current) {
        current.onclose = null;
        current.onmessage = null;
        current.onopen = null;
        current.onerror = null;
        try {
          current.close();
        } catch {
          // Already closing.
        }
      }
      setStatus('idle');
    },
    send(message: ClientMessage): boolean {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    onReconnect(handler) {
      reconnectHandlers.add(handler);
      return () => reconnectHandlers.delete(handler);
    },
    getStatus: () => status,
  };
}
